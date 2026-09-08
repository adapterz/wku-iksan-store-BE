const pool = require('../pool');

const INQUIRY_SELECT = `
  SELECT id, user_id, category, content, admin_reply, status, created_at
  FROM inquiries`;

const getInquiryById = async (id, connection = pool) => {
  const [rows] = await connection.query(`${INQUIRY_SELECT} WHERE id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
};

const createInquiry = async (userId, { category, content }) => {
  const [result] = await pool.query(
    `INSERT INTO inquiries (user_id, category, content) VALUES (?, ?, ?)`,
    [userId, category, content]
  );
  return getInquiryById(result.insertId);
};

// 내 문의 목록 — 최신순.
const getMyInquiries = async (userId, { page, limit }) => {
  const [totals] = await pool.query(
    'SELECT COUNT(*) AS total FROM inquiries WHERE user_id = ?', [userId]
  );
  const [rows] = await pool.query(
    `${INQUIRY_SELECT} WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [userId, limit, (page - 1) * limit]
  );
  return { rows, totalCount: Number(totals[0].total) };
};

// 관리자 문의 큐 — 오래된 문의부터 처리하도록 접수 순서로 정렬한다.
const getInquiries = async ({ status = null, page, limit }) => {
  const conditions = [];
  const params = [];

  if (status !== null) {
    conditions.push('status = ?');
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [totals] = await pool.query(`SELECT COUNT(*) AS total FROM inquiries ${whereClause}`, params);
  const [rows] = await pool.query(
    `${INQUIRY_SELECT} ${whereClause} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  return { rows, totalCount: Number(totals[0].total) };
};

// connection을 넘기면 그 트랜잭션 안에서 실행한다(제재 이의제기 승인 시 정지 해제와
// 하나로 묶어야 할 때 사용할 수 있도록 — adminReportsController.actionReport와 동일 패턴).
//
// 재시도로 완전히 같은 내용을 다시 보내면 값이 안 바뀌어 MySQL이 affectedRows를 0으로
// 보고한다(행을 못 찾은 것과 구분이 안 됨) — sanctionModel.liftSanction과 동일 패턴으로,
// 먼저 조회해 값이 실제로 다를 때만 UPDATE해 재시도에도 멱등하게 동작하게 한다.
const answerInquiry = async (id, adminReply, connection = pool) => {
  const inquiry = await getInquiryById(id, connection);
  if (!inquiry) return null;
  if (inquiry.admin_reply !== adminReply || inquiry.status !== 'answered') {
    await connection.query(
      "UPDATE inquiries SET admin_reply = ?, status = 'answered' WHERE id = ?",
      [adminReply, id]
    );
    return getInquiryById(id, connection);
  }
  return inquiry;
};

module.exports = {
  getInquiryById,
  createInquiry,
  getMyInquiries,
  getInquiries,
  answerInquiry
};
