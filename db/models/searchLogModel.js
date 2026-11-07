const crypto = require('crypto');
const pool = require('../pool');

const SEARCH_LOG_RETENTION_DAYS = 14;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

// SESSION_SECRET과 동일한 방식: 운영에서 salt 없이 뜨는 것을 막는다.
function getHashSalt() {
  const salt = process.env.SEARCH_LOG_HASH_SALT;
  if (salt) return salt;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SEARCH_LOG_HASH_SALT 환경변수가 설정되지 않았습니다.');
  }
  return 'dev-only-search-hash-salt';
}

// 집계용 정규화: trim, 연속 공백 1칸, 대소문자 무시.
function normalizeKeyword(keyword) {
  return keyword.trim().replace(/\s+/g, ' ').toLowerCase();
}

// 로그인 사용자는 user_id 기반, 비회원은 IP+UA 기반으로 해시해 중복 검색을 구분한다.
// IP·user_id 원본은 저장하지 않고 해시만 남긴다.
function computeClientHash(req) {
  const salt = getHashSalt();
  const identity = req.session?.userId
    ? `u:${req.session.userId}`
    : `a:${req.ip}|${req.get('User-Agent') || ''}`;
  return crypto.createHash('sha256').update(salt + identity).digest('hex');
}

async function insertSearchLog({ keyword, normalizedKeyword, resultCount, clientHash }) {
  await pool.query(
    `INSERT INTO search_logs (keyword, normalized_keyword, result_count, client_hash)
     VALUES (?, ?, ?, ?)`,
    [keyword, normalizedKeyword, resultCount, clientHash]
  );
}

// 검색 응답을 막지 않는 기록 진입점. 호출부는 await하지 않고 fire-and-forget으로 쓴다.
// 실패해도 예외를 밖으로 보내지 않고, 실패 로그에도 검색어 원문·IP·UA는 남기지 않는다.
async function recordSearch(req, { keyword, resultCount }) {
  try {
    const normalizedKeyword = normalizeKeyword(keyword);
    const clientHash = computeClientHash(req);
    await insertSearchLog({ keyword, normalizedKeyword, resultCount, clientHash });
  } catch (error) {
    console.error('검색 로그 기록 실패:', error.code || error.message);
  }
}

// 최근 N일간 서로 다른 client_hash가 minSearchers명 이상 검색한 단어만 노출한다
// (트래픽이 적을 때 한 명이 검색한 개인정보성 단어가 그대로 노출되는 것을 막기 위함).
async function getPopularKeywords({ limit, minSearchers, days }) {
  const [rows] = await pool.query(
    `WITH recent AS (
       SELECT id, normalized_keyword, keyword, client_hash, searched_at,
              ROW_NUMBER() OVER (
                PARTITION BY normalized_keyword ORDER BY searched_at DESC, id DESC
              ) AS rn
       FROM search_logs
       WHERE searched_at >= NOW() - INTERVAL ? DAY
         AND result_count > 0
         AND normalized_keyword NOT IN (SELECT normalized_keyword FROM blocked_keywords)
     )
     SELECT MAX(CASE WHEN rn = 1 THEN keyword END) AS keyword,
            COUNT(DISTINCT client_hash)            AS search_count
     FROM recent
     GROUP BY normalized_keyword
     HAVING COUNT(DISTINCT client_hash) >= ?
     ORDER BY search_count DESC, MAX(searched_at) DESC
     LIMIT ?`,
    [days, minSearchers, limit]
  );
  return rows;
}

async function cleanupOldSearchLogs(retentionDays = SEARCH_LOG_RETENTION_DAYS) {
  await pool.query('DELETE FROM search_logs WHERE searched_at < NOW() - INTERVAL ? DAY', [retentionDays]);
}

// 별도 스케줄러 없이(이 프로젝트엔 cron 인프라가 없음) 단일 BE 프로세스 안에서
// setInterval로 하루 주기 삭제를 돈다. 집계 기간(7일)보다 여유를 둔 14일 보관.
function startSearchLogCleanupSchedule() {
  const run = () => {
    cleanupOldSearchLogs().catch(error => {
      console.error('검색 로그 정리 실패:', error.code || error.message);
    });
  };
  run();
  setInterval(run, CLEANUP_INTERVAL_MS).unref();
}

module.exports = {
  normalizeKeyword,
  computeClientHash,
  recordSearch,
  getPopularKeywords,
  cleanupOldSearchLogs,
  startSearchLogCleanupSchedule
};
