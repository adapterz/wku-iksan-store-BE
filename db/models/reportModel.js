const pool = require('../pool');

const REPORT_SELECT = `
  SELECT id, review_id, reporter_id, review_content_snapshot,
         review_rating_snapshot, reason, status, created_at
  FROM reports`;

const getReportById = async (id, connection = pool) => {
  const [rows] = await connection.query(`${REPORT_SELECT} WHERE id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
};

const createReport = async (reporterId, { reviewId, reviewContentSnapshot, reviewRatingSnapshot, reason }) => {
  const [result] = await pool.query(
    `INSERT INTO reports (review_id, reporter_id, review_content_snapshot, review_rating_snapshot, reason)
     VALUES (?, ?, ?, ?, ?)`,
    [reviewId, reporterId, reviewContentSnapshot, reviewRatingSnapshot, reason]
  );
  return getReportById(result.insertId);
};

// 관리자 신고 큐 — 오래된 신고부터 처리하도록 접수 순서로 정렬한다.
const getReports = async ({ status = null, page, limit }) => {
  const conditions = [];
  const params = [];

  if (status !== null) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [totals] = await pool.query(`SELECT COUNT(*) AS total FROM reports ${whereClause}`, params);
  const [rows] = await pool.query(
    `${REPORT_SELECT} ${whereClause} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { rows, totalCount: Number(totals[0].total) };
};

// connection을 넘기면 그 트랜잭션 안에서 실행한다(신고 처리와 리뷰 숨김을 하나로
// 묶어야 할 때 사용). 안 넘기면 지금처럼 단독 쿼리로 처리한다.
const updateReportStatus = async (id, status, connection = pool) => {
  const [result] = await connection.query('UPDATE reports SET status = ? WHERE id = ?', [status, id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return getReportById(id, connection);
};

module.exports = {
  getReportById,
  createReport,
  getReports,
  updateReportStatus
};
