// 명시적으로 요청한 로컬 DB에서만 실행한다. 기존 DB 이름은 사용하지 않는다.
// REVIEW_DB_TEST=1, REVIEW_DB_ENV_FILE=<로컬 DB 접속 환경 파일> npm run test:reviews:db
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const request = require('supertest');
const express = require('express');
const session = require('express-session');

async function main() {
  if (process.env.REVIEW_DB_TEST !== '1') throw new Error('Set REVIEW_DB_TEST=1 explicitly');
  const config = process.env.REVIEW_DB_ENV_FILE
    ? dotenv.parse(fs.readFileSync(process.env.REVIEW_DB_ENV_FILE))
    : process.env;
  if (!['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST)) {
    throw new Error('Only an explicitly configured loopback MySQL server is allowed');
  }
  const connection = await mysql.createConnection({
    host: config.DB_HOST, port: config.DB_PORT || 3306,
    user: config.DB_USER, password: config.DB_PASSWORD
  });
  const database = 'review_test_' + crypto.randomBytes(8).toString('hex');
  let created = false;
  let pool;
  let store;
  let checks = 0;
  const check = (condition, message) => { assert.ok(condition, message); checks++; };
  try {
    const [[{ version }]] = await connection.query('SELECT VERSION() AS version');
    const versionParts = version.split('.').map(Number);
    check(!version.includes('MariaDB') && (versionParts[0] > 8 ||
      (versionParts[0] === 8 && (versionParts[1] > 0 || versionParts[2] >= 16))), 'MySQL >= 8.0.16 required');
    await connection.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci');
    created = true;
    await connection.query('USE ' + database);
    for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) {
      if (config[key] !== undefined) process.env[key] = config[key];
    }
    process.env.DB_NAME = database;
    process.env.NODE_ENV = 'test';

    const runSql = async sql => {
      for (const statement of sql.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) {
        await connection.query(statement);
      }
    };
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    const migration = fs.readFileSync(path.join(__dirname, '../db/migrate_reviews.sql'), 'utf8');
    // 기존 스키마 + 마이그레이션 경로를 실제로 검증.
    await runSql(schema.slice(0, schema.indexOf('CREATE TABLE reviews')));
    await runSql(migration);
    check(schema.slice(schema.indexOf('CREATE TABLE reviews')).trim() ===
      migration.replace(/^--.*$/gm, '').trim(), 'Fresh schema and migration must match');

    pool = require('../db/pool');
    const app = express();
    app.use(express.json());
    store = new session.MemoryStore();
    const { SESSION_COOKIE_NAME, getSessionCookieOptions } = require('../constants/session');
    app.use(session({ name: SESSION_COOKIE_NAME, secret: crypto.randomBytes(32).toString('hex'),
      resave: false, saveUninitialized: false, store, cookie: getSessionCookieOptions(false) }));
    for (const resource of ['auth', 'users', 'orders', 'gifts', 'products', 'reviews']) {
      app.use('/api/' + resource, require('../routes/' + resource));
    }
    const sender = request.agent(app);
    const receiver = request.agent(app);
    const stranger = request.agent(app);
    const password = 'Local-' + crypto.randomBytes(4).toString('hex') + '!';
    const signup = async (agent, email, nickname) => {
      const signed = await agent.post('/api/auth/signup').send({ email, nickname, password });
      assert.equal(signed.status, 201, JSON.stringify(signed.body));
      const logged = await agent.post('/api/auth/login').send({ email, password });
      assert.equal(logged.status, 200, JSON.stringify(logged.body));
      checks += 2;
      return logged.body.data.userId;
    };
    await signup(sender, 'sender@example.test', '발신자');
    const receiverId = await signup(receiver, 'receiver@example.test', '작성당시');
    await signup(stranger, 'stranger@example.test', '다른회원');
    await connection.query("INSERT INTO categories (name) VALUES ('검증분류')");
    const [product] = await connection.query("INSERT INTO products (name, brand, price, category_id) VALUES ('검증상품', '검증브랜드', 1000, 1)");
    const productId = product.insertId;
    const gifts = [];
    for (let i = 0; i < 4; i++) {
      const order = await sender.post('/api/orders').send({ productId, receiverId, isSelfGift: false });
      assert.equal(order.status, 201, JSON.stringify(order.body));
      gifts.push(order.body.data.giftId);
    }
    const body = { giftId: gifts[0], rating: 5, content: '후기 😀' };
    check((await receiver.post('/api/reviews').send(body)).body.code === 'GIFT_NOT_REVIEWABLE', 'unused refused');
    for (const id of gifts) {
      check((await receiver.patch('/api/gifts/' + id + '/use')).status === 200, 'use real gift API');
    }
    check((await stranger.post('/api/reviews').send(body)).status === 403, 'other receiver refused');
    const before = await receiver.get('/api/gifts/' + gifts[0]);
    check(before.body.data.canReview && before.body.data.productId === productId, 'gift detail review fields');
    const simultaneous = await Promise.all([
      receiver.post('/api/reviews').send(body), receiver.post('/api/reviews').send(body)
    ]);
    assert.deepEqual(simultaneous.map(r => r.status).sort(), [201, 409]); checks++;
    const reviewId = simultaneous.find(r => r.status === 201).body.data.reviewId;
    check((await receiver.get('/api/gifts/' + gifts[0])).body.data.reviewId === reviewId, 'created gift state');
    const second = await receiver.post('/api/reviews').send({ giftId: gifts[1], rating: 1, content: '두 번째' });
    const third = await receiver.post('/api/reviews').send({ giftId: gifts[2], rating: 3, content: '세 번째' });
    check(second.status === 201 && third.status === 201, 'multiple reviews per product');
    const publicList = await request(app).get('/api/products/' + productId + '/reviews?limit=1&sort=rating_desc');
    check(publicList.body.data.summary.reviewCount === 3 && publicList.body.data.summary.averageRating === 3, 'summary covers full product');
    check(publicList.body.data.reviews.length === 1 && publicList.body.data.reviews[0].rating === 5, 'pagination and descending rating');
    check(publicList.headers['cache-control'] === 'private, no-store', 'private cache header');
    check(publicList.body.data.reviews[0].isMine === false, 'public ownership false');
    const ownList = await receiver.get('/api/products/' + productId + '/reviews');
    check(ownList.body.data.reviews.every(r => r.isMine), 'real cookie ownership');
    check((await receiver.get('/api/reviews/me?productId=' + productId)).body.data.length === 3, 'my reviews filter');
    check((await stranger.get('/api/reviews/' + reviewId)).status === 403, 'other owner detail');
    check((await stranger.patch('/api/reviews/' + reviewId).send({ rating: 1 })).status === 403, 'other owner update');
    check((await stranger.delete('/api/reviews/' + reviewId)).status === 403, 'other owner delete');
    const edited = await receiver.patch('/api/reviews/' + reviewId).send({ content: ' 수정됨 ', rating: 4 });
    check(edited.body.data.content === '수정됨' && edited.body.data.rating === 4, 'partial update');
    check((await receiver.patch('/api/reviews/' + reviewId).send({ status: 'visible' })).status === 400, 'status cannot be injected');
    await connection.query("UPDATE reviews SET status = 'hidden' WHERE id = ?", [reviewId]);
    const hiddenList = await request(app).get('/api/products/' + productId + '/reviews');
    check(hiddenList.body.data.summary.reviewCount === 2 && hiddenList.body.data.summary.averageRating === 2, 'hidden excluded from summary');
    const hiddenGift = await receiver.get('/api/gifts/' + gifts[0]);
    check(!hiddenGift.body.data.canReview && hiddenGift.body.data.reviewId === reviewId, 'hidden prevents duplicate gift review');
    check((await receiver.post('/api/reviews').send(body)).status === 409, 'hidden duplicate refused');
    check((await receiver.get('/api/reviews/' + reviewId)).status === 200, 'own hidden detail allowed');
    check((await receiver.delete('/api/reviews/' + reviewId)).status === 200, 'user delete');
    check((await receiver.get('/api/gifts/' + gifts[0])).body.data.canReview, 'can rewrite after delete');
    const recreated = await receiver.post('/api/reviews').send(body);
    check(recreated.status === 201, 'rewrite succeeds');
    const newId = recreated.body.data.reviewId;

    for (const [sql, values, code] of [
      ['UPDATE reviews SET rating = 6 WHERE id = ?', [newId], 'ER_CHECK_CONSTRAINT_VIOLATED'],
      ["UPDATE reviews SET status = 'invalid' WHERE id = ?", [newId], 'ER_CHECK_CONSTRAINT_VIOLATED'],
      ['UPDATE reviews SET product_id = 999999 WHERE id = ?', [newId], 'ER_NO_REFERENCED_ROW_2'],
      ['DELETE FROM products WHERE id = ?', [productId], 'ER_ROW_IS_REFERENCED_2'],
      ['DELETE FROM gifts WHERE id = ?', [gifts[0]], 'ER_ROW_IS_REFERENCED_2'],
      ['INSERT INTO reviews (product_id, gift_id, user_id, reviewer_nickname_snapshot, rating, content) VALUES (?, ?, ?, ?, ?, ?)',
        [productId, gifts[0], receiverId, '중복', 5, '중복'], 'ER_DUP_ENTRY']
    ]) {
      await assert.rejects(connection.query(sql, values), error => error.code === code);
      checks++;
    }
    // paid 정책도 fixture 주문만 변경하여 검증한다.
    await connection.query("UPDATE orders o JOIN gifts g ON g.order_id = o.id SET o.payment_status = 'pending' WHERE g.id = ?", [gifts[3]]);
    check((await receiver.get('/api/gifts/' + gifts[3])).body.data.canReview === false, 'unpaid detail cannot review');
    check((await receiver.post('/api/reviews').send({ ...body, giftId: gifts[3] })).status === 403, 'unpaid creation refused');
    await connection.query("UPDATE orders o JOIN gifts g ON g.order_id = o.id SET o.payment_status = 'paid' WHERE g.id = ?", [gifts[3]]);

    await receiver.patch('/api/users/me/nickname').send({ nickname: '변경이후' });
    const snapshot = await request(app).get('/api/products/' + productId + '/reviews');
    check(snapshot.body.data.reviews.every(r => r.nickname === '작성당시'), 'nickname snapshot immutable');
    check((await sender.delete('/api/users/me').send({ password })).status === 200, 'sender delete');
    check((await receiver.get('/api/gifts')).body.data.length === 4, 'gifts survive sender deletion');
    check((await receiver.delete('/api/users/me').send({ password })).status === 200, 'reviewer account delete');
    const [[preserved]] = await connection.query('SELECT COUNT(*) AS total, SUM(user_id IS NULL) AS detached FROM reviews');
    check(preserved.total === 3 && Number(preserved.detached) === 3, 'FK SET NULL preserves reviews');
    const finalList = await request(app).get('/api/products/' + productId + '/reviews');
    check(finalList.body.data.summary.reviewCount === 3, 'public reviews survive account deletion');
    check(finalList.body.data.reviews.every(r => !r.isMine && r.nickname === '작성당시' &&
      !('userId' in r) && !('user_id' in r) && !('giftId' in r)), 'no deleted account identifiers exposed');
    check((await receiver.get('/api/reviews/me')).status === 401, 'deleted session cannot access own reviews');
    console.log(JSON.stringify({ result: 'PASS', mysqlVersion: version, checks, database, cleanup: 'temporary database will be dropped' }));
  } finally {
    if (pool) await pool.end();
    if (store) await new Promise(resolve => store.clear(resolve));
    // 생성에 성공한 이번 실행의 랜덤 DB만 삭제한다. 외부 입력 DB 이름은 사용하지 않는다.
    if (created && /^review_test_[0-9a-f]{16}$/.test(database)) {
      await connection.query('DROP DATABASE ' + database);
      console.log('Temporary review test database removed.');
    }
    await connection.end();
  }
}
main().catch(error => {
  console.error('Review DB verification failed:', { code: error.code, message: error.message });
  process.exitCode = 1;
});
