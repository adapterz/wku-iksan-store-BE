// Real SQL/HTTP regression tests for issue #136 (인기 검색어). Only a random disposable
// database on localhost is used. Optional argument: path to local .env credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const request = require('supertest');
const express = require('express');
require('./helpers/isolate-product-cache');
const config = process.argv[2] ? require('dotenv').parse(fs.readFileSync(process.argv[2])) : process.env;
assert(['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST), 'Local MySQL only');
const database = 'search_logs_test_' + crypto.randomBytes(8).toString('hex');
const root = path.resolve(__dirname, '..');
let admin, pool, created = false, checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

async function runSql(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const sql of source.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await admin.query(sql);
}

async function main() {
  admin = await mysql.createConnection({ host: config.DB_HOST, port: config.DB_PORT || 3306, user: config.DB_USER, password: config.DB_PASSWORD });
  await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci'); created = true;
  await admin.query('USE ' + database);
  await runSql('db/schema.sql');

  await admin.query("INSERT INTO categories(id,name) VALUES(1,'fixture')");
  await admin.query("INSERT INTO products(id,name,brand,price,category_id) VALUES(1,'Air Max','Nike',50000,1)");

  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) if (config[key] !== undefined) process.env[key] = config[key];
  process.env.DB_NAME = database;
  process.env.NODE_ENV = 'test';
  process.env.SEARCH_LOG_HASH_SALT = 'test-salt';
  // 낮은 한도로 설정해 실제로 429까지 도달하는지 확인한다.
  process.env.RATE_LIMIT_PRODUCT_SEARCH_MAX = '3';

  pool = require('../db/pool');
  const searchLogModel = require('../db/models/searchLogModel');
  const productsController = require('../controllers/productsController');

  const app = express();
  app.use(express.json());
  // 테스트 전용 세션 주입. x-test-user가 있으면 로그인 사용자, 없으면 비회원(IP+UA 기준) 검색으로 취급된다.
  app.use((req, res, next) => { req.session = { userId: Number(req.get('x-test-user')) || undefined, authVersion: 1, destroy: cb => cb() }; next(); });
  app.use('/api/products', require('../routes/products'));

  const search = (keyword, { user, ua } = {}) => {
    const req = request(app).get('/api/products').query({ keyword });
    if (user) req.set('x-test-user', String(user));
    if (ua) req.set('User-Agent', ua);
    return req;
  };
  const popularKeywords = () => request(app).get('/api/products/popular-keywords');
  // 검색 로그 기록은 응답을 막지 않는 fire-and-forget이라(의도된 동작, Ethan #136 코멘트),
  // 검색 응답이 돌아온 시점에 DB 기록이 아직 안 끝났을 수 있다. DB로 검증하기 전에 짧게 기다린다.
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const countRows = async (table, where = '1=1', params = []) => {
    const [[row]] = await admin.query(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, params);
    return row.c;
  };

  // ---- keyword 없는 일반 목록 조회는 로그를 남기지 않는다 ----
  await search(undefined).expect(200);
  check(await countRows('search_logs') === 0, 'keyword 없는 조회는 기록 대상에서 제외');
  console.log('PASS keyword 없는 일반 상품 목록 조회는 search_logs에 기록되지 않음');

  // ---- 인기 검색어 후보: 서로 다른 5명이 검색 (로그인 4명 + 비회원 1명), 마지막은 원문 대소문자가 다름 ----
  for (const user of [101, 102, 103, 104]) await search('nike', { user }).expect(200);
  await search('nike', { ua: 'anon-browser-1' }).expect(200); // 비회원 5번째 검색자
  await search('Nike', { user: 101 }).expect(200); // 같은 사람이 다시 검색해도 검색 인원수는 늘지 않음, 대표 원문만 갱신
  await wait(100);
  const nikeRows = await countRows('search_logs', 'normalized_keyword = ?', ['nike']);
  check(nikeRows === 6, `nike 검색 로그 6건 기록 (실제 ${nikeRows}건)`);
  const nikeDistinctHash = (await admin.query('SELECT COUNT(DISTINCT client_hash) AS c FROM search_logs WHERE normalized_keyword = ?', ['nike']))[0][0].c;
  check(nikeDistinctHash === 5, `같은 로그인 사용자의 재검색은 같은 client_hash로 집계 (distinct ${nikeDistinctHash})`);
  console.log('PASS 검색 로그 기록, 로그인 사용자 재검색은 동일 client_hash로 중복 집계되지 않음');

  // ---- 최소 검색 인원(N=3) 미달: 2명만 검색 ----
  for (const user of [201, 202]) await search('희귀검색어', { user }).expect(200);

  // ---- 차단 검색어: 4명이 검색했지만 blocked_keywords에 포함 ----
  for (const user of [301, 302, 303, 304]) await search('금지어', { user }).expect(200);
  await admin.query('INSERT INTO blocked_keywords (normalized_keyword) VALUES (?)', [searchLogModel.normalizeKeyword('금지어')]);

  // ---- 검색 결과 0건: 4명이 검색했지만 일치하는 상품이 없음 ----
  for (const user of [401, 402, 403, 404]) await search('존재안함상품', { user }).expect(200);
  await wait(100);
  const zeroResultRows = await countRows('search_logs', "normalized_keyword = ? AND result_count = 0", [searchLogModel.normalizeKeyword('존재안함상품')]);
  check(zeroResultRows === 4, `결과 0건 검색도 로그는 남되 result_count=0으로 기록 (${zeroResultRows}건)`);

  // ---- 집계 기간(7일) 밖: 8일 전 검색, API를 거치지 않고 직접 삽입 ----
  for (let i = 0; i < 5; i++) {
    await admin.query(
      `INSERT INTO search_logs (keyword, normalized_keyword, result_count, client_hash, searched_at)
       VALUES (?, ?, 1, ?, NOW() - INTERVAL 8 DAY)`,
      ['오래된검색어', '오래된검색어', 'old-hash-' + i]
    );
  }
  console.log('PASS 미달/차단/무결과/기간외 검색어 픽스처 준비 완료');

  await wait(100);
  // ---- 인기 검색어 API: 위 5개 시나리오 중 nike만 노출돼야 한다 ----
  const popular = await popularKeywords().expect(200);
  const keywords = popular.body.data.map(row => row.keyword);
  check(keywords.includes('Nike'), `가장 최근 원문(Nike)이 대표 표기로 노출 (실제: ${JSON.stringify(keywords)})`);
  check(!keywords.includes('nike'), '정규화 이전 소문자 원문은 별도 항목으로 중복 노출되지 않음');
  check(!keywords.includes('희귀검색어'), '최소 검색 인원(3명) 미달 검색어는 노출되지 않음');
  check(!keywords.includes('금지어'), '차단 검색어는 인원 조건을 충족해도 노출되지 않음');
  check(!keywords.includes('존재안함상품'), '검색 결과 0건인 검색어는 노출되지 않음');
  check(!keywords.includes('오래된검색어'), '집계 기간(7일)을 벗어난 검색은 노출되지 않음');
  check(typeof popular.body.meta.computedAt === 'string' && !Number.isNaN(Date.parse(popular.body.meta.computedAt)), 'meta.computedAt은 유효한 시각 문자열');
  console.log('PASS 인기 검색어 API가 최소 인원·차단어·무결과·기간외 조건을 모두 올바르게 적용함');

  // ---- rate limit: keyword 있는 요청만 세고, 계정별로 독립된 카운터를 쓴다 ----
  productsController.resetPopularKeywordsCache();
  for (let i = 0; i < 3; i++) await search('한도테스트', { user: 501 }).expect(200);
  const limited = await search('한도테스트', { user: 501 });
  check(limited.status === 429, `4번째 요청은 429 (실제 ${limited.status})`);
  check(limited.body.code === 'TOO_MANY_REQUESTS', 'rate limit 응답 코드 확인');
  await search(undefined, { user: 501 }).expect(200); // keyword 없는 요청은 한도에 걸리지 않음
  await search('한도테스트', { user: 502 }).expect(200); // 다른 사용자는 별도 카운터라 영향 없음
  console.log('PASS 상품 검색 rate limit: keyword 있는 요청만 계정별로 제한되고 keyword 없는 조회는 영향받지 않음');

  // ---- 로그 보관 기간(14일): 20일 전 로그는 정리 대상, 8일 전 로그는 보관 대상 ----
  await admin.query(
    `INSERT INTO search_logs (keyword, normalized_keyword, result_count, client_hash, searched_at)
     VALUES ('아주오래된검색어', '아주오래된검색어', 1, 'ancient-hash', NOW() - INTERVAL 20 DAY)`
  );
  await searchLogModel.cleanupOldSearchLogs();
  check(await countRows('search_logs', "normalized_keyword = '아주오래된검색어'") === 0, '14일보다 오래된 로그는 정리 대상');
  check(await countRows('search_logs', "normalized_keyword = '오래된검색어'") === 5, '14일 이내(8일 전) 로그는 집계 기간 밖이어도 보관됨');
  console.log('PASS 로그 정리(14일 보관)가 집계 기간(7일)보다 여유 있게 동작함');

  console.log(`ALL PASS (${checks} checks)`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (pool) await pool.end();
  if (admin) {
    if (created) {
      assert(/^search_logs_test_[0-9a-f]{16}$/.test(database));
      await admin.query('DROP DATABASE ' + database);
    }
    await admin.end();
  }
  console.log('Disposable local database removed');
});
