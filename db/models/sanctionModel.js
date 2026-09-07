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
