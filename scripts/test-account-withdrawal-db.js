// Explicit local credentials only. Never run against a production DB/tunnel.
// Creates/drops only its own randomly named database; DB_NAME is ignored.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { AsyncLocalStorage } = require('node:async_hooks');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const express = require('express');
const request = require('supertest');
require('./helpers/isolate-product-cache');
const config = process.argv[2] ? require('dotenv').parse(fs.readFileSync(process.argv[2])) : process.env;
assert(['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST), 'Local MySQL only');
const database = 'withdrawal_test_' + crypto.randomBytes(8).toString('hex');
let admin, pool, created = false, checks = 0, fixtureId = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const context = new AsyncLocalStorage();
const connections = new Map();
const beforeCommit = new Map();
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timed out: ' + label)), 8000);
    })]);
  } finally { clearTimeout(timer); }
}
async function waitForLock(waiter, holder) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const waitingId = connections.get(waiter), holdingId = connections.get(holder);
    if (waitingId && holdingId) {
      const [rows] = await admin.query(`SELECT w.ENGINE_LOCK_ID
        FROM performance_schema.data_locks w
        JOIN performance_schema.threads wt ON wt.THREAD_ID = w.THREAD_ID
        JOIN performance_schema.data_lock_waits d ON d.REQUESTING_ENGINE_LOCK_ID = w.ENGINE_LOCK_ID
        JOIN performance_schema.threads bt ON bt.THREAD_ID = d.BLOCKING_THREAD_ID
        WHERE wt.PROCESSLIST_ID = ? AND bt.PROCESSLIST_ID = ?
          AND w.OBJECT_SCHEMA = ? AND w.OBJECT_NAME = 'users'`, [waitingId, holdingId, database]);
      if (rows.length) { checks++; return; }
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Expected actual users-row lock wait: ' + waiter);
}

async function main() {
  admin = await mysql.createConnection({ host: config.DB_HOST, port: config.DB_PORT || 3306,
    user: config.DB_USER, password: config.DB_PASSWORD });
  await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
  created = true;
  await admin.query('USE ' + database);
  const schema = fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8');
  for (const sql of schema.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await admin.query(sql);
  await admin.query("INSERT INTO categories(id,name) VALUES(1,'fixture')");
  await admin.query("INSERT INTO products(id,name,brand,price,category_id) VALUES(1,'fixture','fixture',1000,1)");
  const password = 'WithdrawalTest2026!';
  const hash = await bcrypt.hash(password, 4);
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) if (config[key] !== undefined) process.env[key] = config[key];
  process.env.DB_NAME = database;
  process.env.NODE_ENV = 'test';
  pool = require('../db/pool');
  const originalGetConnection = pool.getConnection.bind(pool);
  let isolation = 'REPEATABLE READ';
  // Pause only immediately before COMMIT: all actual model queries, locks and writes still run.
  // Async context labels each real HTTP request, avoiding timing-based guesses about who owns a connection.
  pool.getConnection = async () => {
    const connection = await originalGetConnection();
    const tag = context.getStore();
    await connection.query('SET SESSION TRANSACTION ISOLATION LEVEL ' + isolation);
    await connection.query('SET SESSION innodb_lock_wait_timeout = 5');
    if (tag) connections.set(tag, connection.threadId);
    const commit = connection.commit.bind(connection);
    connection.commit = async () => {
      const hook = beforeCommit.get(tag);
      if (hook) await hook();
      return commit();
    };
    return connection;
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { userId: Number(req.get('X-Fixture-User')), authVersion: 1, destroy: cb => cb() };
    context.run(req.get('X-Fixture-Request'), next);
  });
  for (const [url, file] of [['users', 'users'], ['orders', 'orders'], ['order-groups', 'orderGroups']]) {
    app.use('/api/' + url, require('../routes/' + file));
  }
  const http = (tag, user, method, url, body, key) => {
    let call = request(app)[method](url).set('X-Fixture-User', String(user)).set('X-Fixture-Request', tag);
    if (key) call = call.set('Idempotency-Key', key);
    return call.send(body).timeout({ response: 12000, deadline: 15000 }).then(r => r);
  };
  const withdraw = (tag, user) => http(tag, user, 'delete', '/api/users/me', { password });
  async function fixture() {
    const sender = ++fixtureId, receiver = ++fixtureId;
    for (const id of [sender, receiver]) await admin.query('INSERT INTO users(id,email,password,nickname) VALUES(?,?,?,?)',
      [id, `withdrawal${id}@example.test`, hash, 'fixture-' + id]);
    const [cart] = await admin.query('INSERT INTO cart_items(user_id,product_id,quantity) VALUES(?,1,2)', [sender]);
    return { sender, receiver, cartId: cart.insertId };
  }
  const order = (kind, tag, f) => {
    const common = { receiverId: f.receiver, isSelfGift: f.receiver === f.sender, message: 'fixture' };
    if (kind === 'single') return http(tag, f.sender, 'post', '/api/orders', { ...common, productId: 1 });
    if (kind === 'direct') return http(tag, f.sender, 'post', '/api/order-groups/direct',
      { ...common, productId: 1, quantity: 2, expectedUnitPrice: 1000 }, tag);
    return http(tag, f.sender, 'post', '/api/order-groups', { ...common,
      items: [{ cartItemId: f.cartId, quantity: 2, version: 1, expectedUnitPrice: 1000 }] }, tag);
  };
  async function counts(f) {
    const [[row]] = await admin.query(`SELECT
      (SELECT COUNT(*) FROM users WHERE id=?) AS receiver_count,
      (SELECT COUNT(*) FROM orders WHERE user_id=?) AS orders_count,
      (SELECT COUNT(*) FROM gifts g JOIN orders o ON o.id=g.order_id WHERE o.user_id=?) AS gifts_count,
      (SELECT COUNT(*) FROM order_groups WHERE user_id=?) AS groups_count,
      (SELECT COUNT(*) FROM cart_items WHERE user_id=?) AS cart_count,
      (SELECT COUNT(*) FROM orders WHERE user_id=? AND receiver_id IS NULL) AS orphan_count`,
    [f.receiver, f.sender, f.sender, f.sender, f.sender, f.sender]);
    return row;
  }
  for (const level of ['REPEATABLE READ', 'READ COMMITTED']) {
    isolation = level;
    for (const kind of ['single', 'direct', 'cart']) {
      for (const orderFirst of [true, false]) {
        const f = await fixture();
        const prefix = `withdrawal-${f.sender}-${kind}`;
        const holderTag = prefix + '-holder', waiterTag = prefix + '-waiter';
        const reached = deferred(), release = deferred();
        beforeCommit.set(holderTag, async () => { reached.resolve(); await bounded(release.promise, 'release holder'); });
        let holder, waiter;
        try {
          holder = orderFirst ? order(kind, holderTag, f) : withdraw(holderTag, f.receiver);
          // Observe failures immediately rather than leaving an unhandled rejection while waiting.
          holder.catch(() => {});
          await bounded(reached.promise, 'holder before commit');
          waiter = orderFirst ? withdraw(waiterTag, f.receiver) : order(kind, waiterTag, f);
          waiter.catch(() => {});
          await waitForLock(waiterTag, holderTag);
          release.resolve();
          const [first, second] = await Promise.all([holder, waiter]);
          equal(first.status, orderFirst ? 201 : 200, 'first operation commits');
          equal(second.body.code, orderFirst ? 'ACCOUNT_HAS_UNUSED_GIFTS' : 'RECEIVER_NOT_FOUND', 'second operation rejected');
          equal(second.status, orderFirst ? 409 : 404, 'existing error status');
          const n = orderFirst ? (kind === 'single' ? 1 : 2) : 0;
          equal(await counts(f), { receiver_count: orderFirst ? 1 : 0, orders_count: n, gifts_count: n,
            groups_count: orderFirst && kind !== 'single' ? 1 : 0,
            cart_count: orderFirst && kind === 'cart' ? 0 : 1, orphan_count: 0 }, 'no orphan or partial order');
          console.log('PASS', level, kind, orderFirst ? 'order first' : 'withdrawal first');
        } finally {
          release.resolve();
          await Promise.allSettled([holder, waiter].filter(Boolean));
          beforeCommit.delete(holderTag);
          connections.clear();
        }
      }
    }
  }
  // Self-purchases also count as unused gifts. Used gifts may remain as historical records.
  for (const kind of ['single', 'direct', 'cart']) {
    const f = await fixture();
    f.receiver = f.sender;
    const tag = `withdrawal-self-${kind}-${f.sender}`;
    equal((await order(kind, tag, f)).status, 201, 'self purchase');
    equal((await withdraw(tag + '-blocked', f.sender)).body.code, 'ACCOUNT_HAS_UNUSED_GIFTS', 'unused self gift blocks withdrawal');
    await admin.query("UPDATE gifts g JOIN orders o ON o.id=g.order_id SET g.status='used' WHERE o.receiver_id=?", [f.sender]);
    equal((await withdraw(tag + '-allowed', f.sender)).status, 200, 'all used permits withdrawal');
  }
  // Existing active-suspension policy must still apply when there are no unused gifts.
  const f = await fixture();
  await admin.query(`INSERT INTO user_sanctions(user_id,type,reason,issued_by,ends_at)
    VALUES(?,'suspension','fixture',?,DATE_ADD(NOW(), INTERVAL 30 DAY))`, [f.receiver, f.sender]);
  equal((await withdraw('withdrawal-suspended', f.receiver)).body.code, 'ACCOUNT_HAS_ACTIVE_SANCTION', 'active suspension blocks withdrawal');
  await admin.query("UPDATE user_sanctions SET status='lifted' WHERE user_id=?", [f.receiver]);
  equal((await withdraw('withdrawal-lifted', f.receiver)).status, 200, 'lifted suspension permits withdrawal');
  console.log(JSON.stringify({ result: 'PASS', checks, database }));
}
main().catch(error => { console.error('Withdrawal DB test failed:', error); process.exitCode = 1; }).finally(async () => {
  if (pool) await pool.end();
  if (created && /^withdrawal_test_[a-f0-9]{16}$/.test(database)) {
    await admin.query('DROP DATABASE ' + database);
    console.log('Temporary withdrawal database removed');
  }
  if (admin) await admin.end();
});
