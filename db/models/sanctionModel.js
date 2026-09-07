const pool = require('../pool');

const SANCTION_SELECT = `
  SELECT id, user_id, type, reason, issued_by, ends_at, status, created_at
  FROM user_sanctions`;

const getSanctionById = async (id) => {
  const [rows] = await pool.query(`${SANCTION_SELECT} WHERE id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// 이미 경고가 있는 유저에게 또 경고를 주려는 요청을 막기 위한 카운트(이슈 #90 7-2절).
const countWarnings = async (userId) => {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM user_sanctions WHERE user_id = ? AND type = 'warning'",
    [userId]
  );
  return Number(rows[0].total);
};

// endsAt은 JS Date 객체를 그대로 저장한다. db/pool.js에 timezone 설정이 없어 mysql2가
// Node 프로세스의 로컬 타임존 기준으로 변환해서 저장하고, 읽어올 때도 동일 기준으로
// 되돌리므로 이 앱 안에서 주고받는 값은 일관된다. 다만 나중에 정지 여부 판단 훅에서
// SQL의 NOW()와 직접 비교하는 코드를 추가할 때는, MySQL 서버 세션 타임존이 Node
// 프로세스 타임존과 다르면 오차가 생길 수 있으니 그때 반드시 확인해야 한다.
const createSanction = async (userId, issuedBy, { type, reason, endsAt }) => {
  const [result] = await pool.query(
    `INSERT INTO user_sanctions (user_id, type, reason, issued_by, ends_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, reason, issuedBy, endsAt]
  );
  return getSanctionById(result.insertId);
};

// 특정 유저의 제재 이력 — 최신순.
const getUserSanctions = async (userId, { page, limit }) => {
  const [totals] = await pool.query(
    'SELECT COUNT(*) AS total FROM user_sanctions WHERE user_id = ?', [userId]
  );
  const [rows] = await pool.query(
    `${SANCTION_SELECT} WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [userId, limit, (page - 1) * limit]
  );
  return { rows, totalCount: Number(totals[0].total) };
};

const liftSanction = async (id) => {
  const sanction = await getSanctionById(id);
  if (!sanction) return null;
  // 이미 lifted인 걸 다시 lifted로 UPDATE하면 값이 안 바뀌어 MySQL이 affectedRows를
  // 0으로 보고한다(행을 못 찾은 것과 구분이 안 됨) — 재시도/중복 클릭에도 멱등하게
  // 동작하도록 값이 실제로 바뀔 때만 UPDATE한다(reviewModel.updateReviewStatus와 동일 패턴).
  if (sanction.status !== 'lifted') {
    await pool.query("UPDATE user_sanctions SET status = 'lifted' WHERE id = ?", [id]);
    return getSanctionById(id);
  }
  return sanction;
};

module.exports = {
  getSanctionById,
  countWarnings,
  createSanction,
  getUserSanctions,
  liftSanction
};
