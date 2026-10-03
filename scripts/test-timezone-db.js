// Opt-in, loopback only. Each worker owns a random disposable DB, never DB_NAME.
// TIMEZONE_DB_TEST=1 DB_HOST=127.0.0.1 ... npm run test:timezone:db
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const mysql = require('mysql2/promise');
const express = require('express');
const request = require('supertest');
require('./helpers/isolate-product-cache');

async function worker() {
  const config = {
    host: process.env.DB_HOST, port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD
  };
  const database = 'timezone_test_' + crypto.randomBytes(8).toString('hex');
  const admin = await mysql.createConnection({ ...config, dateStrings: true });
  let pool, created = false, checks = 0;
  const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
  const nearNow = date => {
    assert.ok(Math.abs(Date.now() - new Date(date).getTime()) < 30000, `Not current instant: ${date}`);
    checks++;
  };
  try {
    // The driver option does NOT set the server session timezone. Never SET GLOBAL here.
    const [[clock]] = await admin.query('SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset_minutes');
    equal(clock.offset_minutes, 540);
    await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    created = true;
    await admin.query('USE ' + database);
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    for (const sql of schema.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
      await admin.query(sql);
    }
    process.env.DB_NAME = database;
    process.env.NODE_ENV = 'test';
    pool = require('../db/pool');
    const [[poolClock]] = await pool.query('SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS offset_minutes');
    equal(poolClock.offset_minutes, 540);

    // Reproduce the old UTC-driver interpretation before testing the fixed pool.
    const oldDriver = await mysql.createConnection({ ...config, database, timezone: 'Z' });
    try {
      const [[old]] = await oldDriver.query("SELECT CAST('2026-09-22 21:14:48' AS DATETIME) AS value");
      equal(old.value.toISOString(), '2026-09-22T21:14:48.000Z');
    } finally { await oldDriver.end(); }
    const cases = [
      ['2026-09-22 21:14:48', '2026-09-22T12:14:48.000Z'],
      ['2026-09-22 14:59:59', '2026-09-22T05:59:59.000Z'],
      ['2026-09-22 15:00:00', '2026-09-22T06:00:00.000Z'],
      ['2026-09-22 23:59:59', '2026-09-22T14:59:59.000Z'],
      ['2026-09-23 00:00:00', '2026-09-22T15:00:00.000Z'],
      ['2028-02-29 00:00:00', '2028-02-28T15:00:00.000Z']
    ];
    for (const [stored, iso] of cases) {
      for (const method of ['query', 'execute']) {
        const [[row]] = await pool[method]('SELECT CAST(? AS DATETIME) AS value, CAST(NULL AS DATETIME) AS null_value', [stored]);
        equal(row.value.toISOString(), iso);
        equal(row.null_value, null);
      }
    }

    for (const id of [1, 2, 3, 4]) await admin.query(
      'INSERT INTO users(id,email,password,nickname) VALUES(?,?,?,?)',
      [id, `timezone${id}@example.test`, 'fixture', `timezone${id}`]);
    await admin.query("INSERT INTO categories(id,name) VALUES(1,'fixture')");
    await admin.query("INSERT INTO products(id,name,brand,price,category_id) VALUES(1,'fixture','fixture',100,1)");
    await admin.query(`INSERT INTO orders(id,user_id,sender_nickname_snapshot,product_id,receiver_id,
      receiver_nickname_snapshot,total_price,is_self_gift,payment_status)
      VALUES(1,1,'sender',1,2,'receiver',100,false,'paid')`);
    await admin.query(`INSERT INTO gifts(id,order_id,barcode,status,used_at,created_at)
      VALUES(1,1,'timezone-fixture','used','2026-09-22 21:14:48','2026-09-22 21:00:00')`);
    const app = express();
    app.use(express.json());
    // Authentication is injected only in this fixture. Real gift routes/controllers/models execute.
    app.use((req, res, next) => { req.session = { userId: 2, authVersion: 1 }; next(); });
    app.use('/api/gifts', require('../routes/gifts'));
    const list = await request(app).get('/api/gifts');
    equal(list.status, 200);
    equal(list.body.data[0].usedAt, '2026-09-22T12:14:48.000Z');
    equal(list.body.data[0].createdAt, '2026-09-22T12:00:00.000Z');
    const detail = await request(app).get('/api/gifts/1');
    equal(detail.status, 200);
    equal(detail.body.data.usedAt, '2026-09-22T12:14:48.000Z');
    equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(detail.body.data.usedAt)), '2026-09-22');
    const [[rawGift]] = await admin.query('SELECT used_at FROM gifts WHERE id=1');
    equal(rawGift.used_at, '2026-09-22 21:14:48');
    await admin.query("UPDATE gifts SET status='unused',used_at=NULL WHERE id=1");
    const unused = await request(app).get('/api/gifts/1');
    equal(unused.body.data.usedAt, null);
    equal((await request(app).patch('/api/gifts/1/use')).status, 200);
    nearNow((await request(app).get('/api/gifts/1')).body.data.usedAt);
    const gifts = require('../db/models/giftModel');
    equal(await gifts.notifyGifts(2, [1]), true);
    const [[notified]] = await pool.query('SELECT notified_at FROM gifts WHERE id=1');
    nearNow(notified.notified_at);

    const sanctions = require('../db/models/sanctionModel');
    const dashboard = require('../db/models/dashboardModel');
    const future = new Date(Math.floor(Date.now() / 1000) * 1000 + 3600000);
    const past = new Date(future.getTime() - 7200000);
    const createdSanction = await sanctions.createSanction(2, 1, { type: 'suspension', reason: 'fixture', endsAt: future });
    equal(createdSanction.ends_at.toISOString(), future.toISOString());
    nearNow(createdSanction.created_at);
    const [[rawSanction]] = await admin.query('SELECT ends_at FROM user_sanctions WHERE id=?', [createdSanction.id]);
    equal(rawSanction.ends_at, new Date(future.getTime() + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' '));
    await sanctions.createSanction(3, 1, { type: 'suspension', reason: 'expired fixture', endsAt: past });
    equal((await sanctions.getActiveSuspension(2)).id, createdSanction.id);
    equal(await sanctions.getActiveSuspension(3), null);
    equal(await dashboard.countActiveSuspensions(), 1);
    const warning = await sanctions.createSanction(3, 1, { type: 'warning', reason: 'fixture', endsAt: null });
    equal(warning.ends_at, null);

    // Legacy UTC-written ends_at is a DATA conversion prerequisite, not auto-detectable.
    const utcWallClock = future.toISOString().slice(0, 19).replace('T', ' ');
    const [legacy] = await admin.query(`INSERT INTO user_sanctions(user_id,type,reason,issued_by,ends_at)
      VALUES(4,'suspension','known UTC test fixture',1,?)`, [utcWallClock]);
    equal(await sanctions.getActiveSuspension(4), null);
    const [corrected] = await admin.query(`UPDATE user_sanctions SET ends_at=DATE_ADD(ends_at,INTERVAL 9 HOUR)
      WHERE id=? AND ends_at=?`, [legacy.insertId, utcWallClock]);
    equal(corrected.affectedRows, 1);
    equal((await sanctions.getActiveSuspension(4)).ends_at.toISOString(), future.toISOString());
    equal(await dashboard.countActiveSuspensions(), 2);
    console.log(`PASS TZ=${process.env.TZ}: ${checks} checks (real MySQL, gift HTTP, sanctions, legacy fixture)`);
  } finally {
    try { if (pool) await pool.end(); }
    finally {
      try { if (created) await admin.query('DROP DATABASE ' + database); }
      finally { await admin.end(); }
    }
  }
}

async function main() {
  assert.equal(process.env.TIMEZONE_DB_TEST, '1', 'Set TIMEZONE_DB_TEST=1 explicitly');
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST), 'Loopback MySQL only');
  if (process.argv.includes('--worker')) return worker();
  for (const TZ of ['UTC', 'Asia/Seoul']) {
    const result = spawnSync(process.execPath, [__filename, '--worker'], {
      env: { ...process.env, TZ }, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `Worker failed: ${TZ}`);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
