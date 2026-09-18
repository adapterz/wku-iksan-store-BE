// Explicit loopback credentials only; creates/drops a random database, never supplied DB_NAME.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const express = require('express');
const request = require('supertest');
require('./helpers/isolate-product-cache');
const config = process.argv[2] ? require('dotenv').parse(fs.readFileSync(process.argv[2])) : process.env;
assert(['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST), 'Local MySQL only');
const database = 'direct_order_test_' + crypto.randomBytes(8).toString('hex');
let admin, pool, created = false, checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };

async function main() {
  admin = await mysql.createConnection({ host: config.DB_HOST, port: config.DB_PORT || 3306, user: config.DB_USER, password: config.DB_PASSWORD });
  await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci'); created = true;
  await admin.query('USE ' + database);
  const schema = fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8');
  for (const sql of schema.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await admin.query(sql);
  for (let i = 1; i <= 8; i++) await admin.query('INSERT INTO users(id,email,password,nickname) VALUES(?,?,?,?)', [i, `direct${i}@example.test`, 'fixture', 'fixture-' + i]);
  await admin.query("INSERT INTO categories(id,name) VALUES(1,'fixture')");
  await admin.query("INSERT INTO products(id,name,brand,price,category_id) VALUES(1,'coffee','brand',1000,1),(2,'bread','brand',2000,1)");
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) if (config[key] !== undefined) process.env[key] = config[key];
  process.env.DB_NAME = database; process.env.NODE_ENV = 'test';
  pool = require('../db/pool');
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.session = { userId: Number(req.get('X-Fixture-User')) || undefined, authVersion: 1, destroy: cb => cb() }; next(); });
  for (const route of ['cart-items', 'order-groups', 'orders', 'gifts', 'reviews']) {
    const file = { 'cart-items': 'cartItems', 'order-groups': 'orderGroups' }[route] || route;
    app.use('/api/' + route, require('../routes/' + file));
  }
  const http = (user, method, url, body, key) => {
    let call = request(app)[method](url).set('X-Fixture-User', String(user));
    if (key !== undefined) call = call.set('Idempotency-Key', key);
    return body ? call.send(body) : call;
  };
  const body = { productId: 1, quantity: 3, expectedUnitPrice: 1000, isSelfGift: false, receiverId: 2, message: 'gift' };
  const direct = (value = body, key = 'direct-request-123456', user = 1) => http(user, 'post', '/api/order-groups/direct', value, key);
  const counts = async () => {
    const [[row]] = await admin.query('SELECT (SELECT COUNT(*) FROM order_groups) AS groups_count, (SELECT COUNT(*) FROM orders) AS orders_count, (SELECT COUNT(*) FROM gifts) AS gifts_count');
    return row;
  };
  check((await direct(body, 'anonymous-request-123', 0)).status === 401, 'anonymous rejected');
  await http(1, 'post', '/api/cart-items', { productId: 1, quantity: 7 });
  await http(1, 'post', '/api/cart-items', { productId: 2, quantity: 2 });
  const [cartBefore] = await admin.query('SELECT * FROM cart_items ORDER BY id');
  const simultaneous = await Promise.all(Array.from({ length: 5 }, () => direct()));
  check(simultaneous.every(r => r.status === 201), 'five concurrent same-key requests succeed');
  const group = simultaneous[0].body.data;
  check(new Set(simultaneous.map(r => r.body.data.orderGroupId)).size === 1, 'only one group created');
  equal(await counts(), { groups_count: 1, orders_count: 3, gifts_count: 3 });
  check(group.totalQuantity === 3 && group.totalPrice === 3000 && group.items[0].quantity === 3, 'quantity and price');
  check(group.items[0].units.length === 3, 'three individually usable units');
  const [cartAfter] = await admin.query('SELECT * FROM cart_items ORDER BY id'); equal(cartAfter, cartBefore);
  equal((await direct()).body.data, group);
  equal((await http(1, 'get', '/api/order-groups/' + group.orderGroupId)).body.data, group);
  check((await http(3, 'get', '/api/order-groups/' + group.orderGroupId)).status === 404, 'owner privacy');
  check(!/barcode|request_hash|idempotency_key|direct-request/.test(JSON.stringify(group)), 'no private fields');
  for (const change of [{ quantity: 2 }, { receiverId: 3 }, { message: 'other' }, { expectedUnitPrice: 2000 }, { productId: 2 }]) {
    check((await direct({ ...body, ...change })).body.code === 'IDEMPOTENCY_KEY_REUSED', 'changed intent rejected');
  }
  const cartItems = (await http(1, 'get', '/api/cart-items')).body.data;
  const cartBody = { items: cartItems.map(item => ({ cartItemId: item.cartItemId, quantity: item.quantity, version: item.version, expectedUnitPrice: item.unitPrice })), isSelfGift: false, receiverId: 2 };
  check((await http(1, 'post', '/api/order-groups', cartBody, 'direct-request-123456')).body.code === 'IDEMPOTENCY_KEY_REUSED', 'direct key cannot be used for cart');
  const cartGroup = await http(1, 'post', '/api/order-groups', cartBody, 'cart-request-12345678');
  check(cartGroup.status === 201 && cartGroup.body.data.totalQuantity === 9, 'cart existing checkout still works');
  check((await direct(body, 'cart-request-12345678')).body.code === 'IDEMPOTENCY_KEY_REUSED', 'cart key cannot be used for direct');
  check((await http(1, 'get', '/api/cart-items')).body.data.length === 0, 'cart checkout still removes selected items');
  const one = await direct({ ...body, quantity: 1, isSelfGift: true, receiverId: undefined }, 'one-unit-request-1234');
  check(one.status === 201 && one.body.data.totalQuantity === 1 && one.body.data.receiver.userId === 1, 'one-unit self gift also grouped');
  const ten = await direct({ ...body, quantity: 10 }, 'ten-unit-request-1234');
  check(ten.status === 201 && ten.body.data.items[0].units.length === 10, 'ten units');
  for (const quantity of [0, -1, 1.5, '3', null]) check((await direct({ ...body, quantity }, 'invalid-request-12345')).body.code === 'INVALID_QUANTITY', 'invalid quantity');
  check((await direct({ ...body, quantity: 11 }, 'excess-request-123456')).body.code === 'ORDER_QUANTITY_EXCEEDED', 'quantity limit');
  const beforeRejected = await counts();
  check((await direct({ ...body, expectedUnitPrice: 999 }, 'price-request-1234567')).body.code === 'PRODUCT_PRICE_CHANGED', 'price guard');
  check((await direct({ ...body, productId: 999 }, 'missing-request-12345')).body.code === 'PRODUCT_NOT_FOUND', 'missing product');
  check((await direct({ ...body, receiverId: 999 }, 'receiver-request-1234')).body.code === 'RECEIVER_NOT_FOUND', 'missing receiver');
  for (const status of ['hidden', 'discontinued']) {
    await admin.query('UPDATE products SET status=? WHERE id=1', [status]);
    check((await direct(body, 'status-request-123456')).body.code === 'PRODUCT_UNAVAILABLE', 'unavailable product');
    equal((await direct()).body.data, group);
  }
  await admin.query("UPDATE products SET status='active', price=1500 WHERE id=1");
  check((await direct(body, 'new-price-request-123')).body.code === 'PRODUCT_PRICE_CHANGED', 'price change after display');
  equal((await direct()).body.data, group);
  equal(await counts(), beforeRejected);
  await admin.query('UPDATE products SET price=1000 WHERE id=1');
  const distinct = await Promise.all(['different-request-111', 'different-request-222'].map(key => direct(body, key)));
  check(distinct.every(r => r.status === 201) && distinct[0].body.data.orderGroupId !== distinct[1].body.data.orderGroupId, 'distinct orders are not incorrectly deduplicated');
  const cross = await Promise.all([direct({ ...body, receiverId: 5 }, 'cross-request-1234567', 4), direct({ ...body, receiverId: 4 }, 'cross-request-1234567', 5)]);
  check(cross.every(r => r.status === 201), 'cross gifts lock in consistent order');

  const beforeFailure = await counts();
  await admin.query("CREATE TRIGGER fail_second_direct_gift BEFORE INSERT ON gifts FOR EACH ROW BEGIN IF (SELECT COUNT(*) FROM orders WHERE order_group_id=(SELECT order_group_id FROM orders WHERE id=NEW.order_id))=2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture'; END IF; END");
  check((await direct(body, 'rollback-request-1234')).status === 500, 'second gift insert failure');
  equal(await counts(), beforeFailure);
  await admin.query('DROP TRIGGER fail_second_direct_gift');
  check((await direct(body, 'rollback-request-1234')).status === 201, 'same key reusable after full rollback');

  const [[existingCode]] = await admin.query('SELECT barcode FROM gifts ORDER BY id LIMIT 1');
  const originalRandom = crypto.randomInt;
  const randomBase = 987654320000;
  try {
    let calls = 0;
    crypto.randomInt = () => ++calls === 1 ? Number(existingCode.barcode) : randomBase + calls;
    const collision = await direct(body, 'collision-request-123');
    check(collision.status === 201 && calls === 4, 'barcode collision retries each unit');
    const beforeExhaustion = await counts();
    crypto.randomInt = () => Number(existingCode.barcode);
    check((await direct(body, 'exhaustion-request-12')).status === 500, 'barcode retry bounded');
    equal(await counts(), beforeExhaustion);
  } finally { crypto.randomInt = originalRandom; }

  const units = group.items[0].units;
  check((await http(2, 'get', '/api/gifts/' + units[0].giftId)).status === 200, 'recipient detail');
  check((await http(2, 'patch', '/api/gifts/' + units[0].giftId + '/use')).status === 200, 'individual gift use');
  check((await http(2, 'post', '/api/reviews', { giftId: units[0].giftId, rating: 5, content: 'review' })).status === 201, 'review after individual use');
  const [[unused]] = await admin.query('SELECT status FROM gifts WHERE id=?', [units[1].giftId]);
  check(unused.status === 'unused', 'other unit untouched');
  const single = await http(1, 'post', '/api/orders', { productId: 1, isSelfGift: true });
  check(single.status === 201, 'legacy single endpoint preserved');
  equal(Object.keys(single.body.data).sort(), ['giftId', 'orderId']);
  const [[legacy]] = await admin.query('SELECT order_group_id FROM orders WHERE id=?', [single.body.data.orderId]);
  check(legacy.order_group_id === null, 'legacy order remains ungrouped');
  await admin.query('DELETE FROM users WHERE id=2');
  const replay = await direct();
  check(replay.status === 201 && replay.body.data.receiver.userId === null && replay.body.data.receiver.nickname === 'fixture-2', 'completed request replay after recipient deletion');
  check((await direct(body, 'deleted-receiver-1234')).body.code === 'RECEIVER_NOT_FOUND', 'new order cannot target deleted user');
  console.log(JSON.stringify({ result: 'PASS', checks, database }));
}
main().catch(error => { console.error('Direct order DB test failed:', error); process.exitCode = 1; }).finally(async () => {
  if (pool) await pool.end();
  if (created && /^direct_order_test_[a-f0-9]{16}$/.test(database)) {
    await admin.query('DROP DATABASE ' + database);
    console.log('Temporary direct order database removed');
  }
  if (admin) await admin.end();
});
