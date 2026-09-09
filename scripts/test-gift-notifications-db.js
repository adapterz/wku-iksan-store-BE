// Real SQL/HTTP regression tests. Only a random disposable database on localhost is used.
// Optional argument: path to local .env credentials. Never uses its DB_NAME.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const request = require('supertest');
const express = require('express');
const root = path.resolve(__dirname, '..');
const config = process.argv[2] ? require('dotenv').parse(fs.readFileSync(process.argv[2])) : process.env;
assert(['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST), 'Local MySQL only');
const database = 'gift_notify_test_' + crypto.randomBytes(8).toString('hex');
let admin, pool, created = false;

async function runSql(source) {
  for (const sql of source.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
    await admin.query(sql);
  }
}

async function main() {
  admin = await mysql.createConnection({ host: config.DB_HOST, port: config.DB_PORT || 3306,
    user: config.DB_USER, password: config.DB_PASSWORD });
  await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  created = true;
  await admin.query('USE ' + database);
  await runSql(fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8'));
  const [freshColumns] = await admin.query('SHOW COLUMNS FROM gifts');
  assert(freshColumns.some(c => c.Field === 'notified_at' && c.Null === 'YES' && c.Default === null));
  for (const id of [1, 2, 3]) await admin.query(
    'INSERT INTO users (id,email,password,nickname) VALUES (?,?,?,?)',
    [id, `fixture${id}@example.test`, 'not-a-real-password', `fixture${id}`]);
  await admin.query("INSERT INTO categories (id,name) VALUES (1,'fixture')");
  await admin.query("INSERT INTO products (id,name,brand,price,category_id) VALUES (1,'fixture','fixture',100,1)");
  let counter = 0;
  async function gift({ receiver = 2, self = false, payment = 'paid', sender = 1, used = false } = {}) {
    const [order] = await admin.query(`INSERT INTO orders
      (user_id,sender_nickname_snapshot,product_id,receiver_id,receiver_nickname_snapshot,total_price,is_self_gift,payment_status)
      VALUES (?,?,1,?,'receiver',100,?,?)`, [sender, 'sender', receiver, self, payment]);
    const [row] = await admin.query('INSERT INTO gifts (order_id,barcode,status) VALUES (?,?,?)',
      [order.insertId, 'fixture-' + ++counter, used ? 'used' : 'unused']);
    return row.insertId;
  }
  // Exercise the actual migration against the pre-change table with an existing gift.
  await admin.query('ALTER TABLE gifts DROP COLUMN notified_at');
  const legacy = await gift();
  const migration = fs.readFileSync(path.join(root, 'db/migrate_gift_notifications.sql'), 'utf8');
  await runSql(migration);
  const [migratedColumns] = await admin.query('SHOW COLUMNS FROM gifts');
  assert.deepEqual(migratedColumns.find(c => c.Field === 'notified_at'), freshColumns.find(c => c.Field === 'notified_at'));
  const [legacyRows] = await admin.query('SELECT notified_at = created_at AS initialized FROM gifts WHERE id = ?', [legacy]);
  assert.equal(legacyRows[0].initialized, 1);
  console.log('PASS schema and migration agree; legacy gifts initialized');

  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) if (config[key] !== undefined) process.env[key] = config[key];
  process.env.DB_NAME = database;
  process.env.NODE_ENV = 'test';
  pool = require('../db/pool');
  const app = express();
  app.use(express.json());
  // Test-only session injection. Production login/session behavior is not replaced in app.js.
  app.use((req, res, next) => { req.session = { userId: Number(req.get('x-test-user')) || undefined }; next(); });
  app.use('/api/gifts', require('../routes/gifts'));
  const get = (user = 2) => request(app).get('/api/gifts/unnotified').set('x-test-user', String(user));
  const notify = (ids, user = 2) => request(app).patch('/api/gifts/notify').set('x-test-user', String(user)).send({ giftIds: ids });
  const state = async id => {
    const [rows] = await admin.query('SELECT notified_at, status, used_at FROM gifts WHERE id = ?', [id]);
    return rows[0];
  };
  assert.equal((await get(0)).status, 401);
  assert.equal((await notify([legacy], 0)).status, 401);
  assert.deepEqual((await get()).body.data, { count: 0, giftIds: [] });
  const a = await gift(), b = await gift({ used: true });
  const other = await gift({ receiver: 3 }), own = await gift({ self: true, sender: 2 });
  const unpaid = await gift({ payment: 'pending' }), refunded = await gift({ payment: 'refunded' });
  const orphan = await gift({ receiver: null });
  // Deleting sender must not hide recipients' notifications.
  await admin.query('DELETE FROM users WHERE id = 1');
  const initial = await get();
  assert.equal(initial.status, 200);
  assert.equal(initial.headers['cache-control'], 'private, no-store');
  assert.deepEqual(initial.body.data, { count: 2, giftIds: [a, b] });
  console.log('PASS authenticated exact filters, used gift included, deleted sender supported, cache disabled');
  // A gift arrives after the modal has captured a,b.
  const later = await gift({ sender: 3 });
  for (const invalid of [other, own, unpaid, refunded, orphan, 999999]) {
    const response = await notify([a, invalid]);
    assert.equal(response.status, 404);
    assert.equal((await state(a)).notified_at, null);
  }
  assert.equal((await notify(['1'])).status, 400);
  assert.equal((await notify([])).status, 400);
  assert.equal((await notify([a, b, a])).status, 200);
  assert.deepEqual((await get()).body.data, { count: 1, giftIds: [later] });
  const firstState = await state(a), usedState = await state(b);
  assert.equal(firstState.status, 'unused');
  assert.equal(firstState.used_at, null);
  assert.equal(usedState.status, 'used');
  // Use a distinct sentinel to prove retry does not rewrite the first timestamp.
  await admin.query("UPDATE gifts SET notified_at = '2001-01-01 00:00:00' WHERE id = ?", [a]);
  const beforeRetry = await state(a);
  assert.equal((await notify([a, b])).status, 200);
  assert.deepEqual(await state(a), beforeRetry);
  console.log('PASS all-or-nothing ownership, only shown IDs acknowledged, retry preserves timestamp and usage state');

  const c = await gift({ sender: 3 }), d = await gift({ sender: 3 });
  const concurrent = await Promise.all([notify([c, d]), notify([d, c])]);
  assert.deepEqual(concurrent.map(r => r.status), [200, 200]);
  assert((await state(c)).notified_at);
  assert((await state(d)).notified_at);
  console.log('PASS overlapping concurrent acknowledgements are safe');
  // Fail the second update in a batch: the first must roll back too.
  const e = await gift({ sender: 3 }), f = await gift({ sender: 3 });
  await admin.query(`CREATE TRIGGER fail_notification BEFORE UPDATE ON gifts FOR EACH ROW
    BEGIN IF NEW.id = ${f} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'fixture failure'; END IF; END`);
  const previousError = console.error;
  console.error = () => {};
  try { assert.equal((await notify([e, f])).status, 500); }
  finally { console.error = previousError; await admin.query('DROP TRIGGER fail_notification'); }
  assert.equal((await state(e)).notified_at, null);
  assert.equal((await state(f)).notified_at, null);
  assert.equal((await notify([e, f])).status, 200);
  // Running the complete migration twice stops at duplicate column before the dangerous backfill.
  await assert.rejects(runSql(migration), error => error.code === 'ER_DUP_FIELDNAME');
  assert.equal((await state(later)).notified_at, null);
  console.log('PASS DB failure rolls back whole batch; retry succeeds; repeated migration does not clear new notifications');
  const detail = await request(app).get('/api/gifts/' + a).set('x-test-user', '2');
  assert.equal(detail.status, 200);
  const use = await request(app).patch('/api/gifts/' + a + '/use').set('x-test-user', '2');
  assert.equal(use.status, 200);
  assert.deepEqual((await state(a)).notified_at, beforeRetry.notified_at);
  assert.equal((await request(app).get('/api/gifts').set('x-test-user', '2')).status, 200);
  console.log('PASS existing gift list/detail/use routes');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (pool) await pool.end();
  if (admin) {
    if (created) {
      assert(/^gift_notify_test_[0-9a-f]{16}$/.test(database));
      await admin.query('DROP DATABASE ' + database);
    }
    await admin.end();
  }
  console.log('Disposable local database removed');
});
