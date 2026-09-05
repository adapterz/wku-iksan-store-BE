// receiverId 기준 조회, 발신자(sender) 닉네임은 탈퇴·닉네임 변경 이후에도 주문 당시
// 값을 그대로 보여주기 위해 users 테이블이 아니라 orders.sender_nickname_snapshot을 사용한다.
const pool = require('../pool');

const getGiftsByReceiverId = async (receiverId, status) => {
  let query = `
    SELECT
      g.id as gift_id,
      p.id as product_id,
      o.receiver_id,
      o.payment_status,
      r.id as review_id,
      p.name as product_name,
      p.thumbnail_url as thumbnail_url,
      p.brand as brand,
      g.status as status,
      o.sender_nickname_snapshot as sender_nickname,
      o.is_self_gift as is_self_gift,
      g.created_at as created_at,
      g.used_at as used_at
    FROM gifts g
    JOIN orders o ON g.order_id = o.id
    JOIN products p ON o.product_id = p.id
    LEFT JOIN reviews r ON r.gift_id = g.id
    WHERE o.receiver_id = ? AND o.payment_status = 'paid'
  `;
  const params = [receiverId];

  if (status === 'unused' || status === 'used') {
    query += ` AND g.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY g.created_at DESC`;

  const [rows] = await pool.query(query, params);
  return rows;
};

const getGiftDetailById = async (giftId) => {
  const query = `
    SELECT
      g.id as gift_id,
      p.id as product_id,
      o.payment_status,
      r.id as review_id,
      p.name as product_name,
      p.thumbnail_url as thumbnail_url,
      g.barcode,
      g.status,
      g.used_at,
      o.message,
      o.receiver_id,
      o.is_self_gift,
      o.user_id as sender_id,
      o.sender_nickname_snapshot as sender_nickname
    FROM gifts g
    JOIN orders o ON g.order_id = o.id
    JOIN products p ON o.product_id = p.id
    LEFT JOIN reviews r ON r.gift_id = g.id
    WHERE g.id = ?
  `;
  const [rows] = await pool.query(query, [giftId]);
  return rows.length > 0 ? rows[0] : null;
};

const updateGiftStatusToUsed = async (giftId) => {
  const [result] = await pool.query(
    `UPDATE gifts SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'unused'`,
    [giftId]
  );
  return result.affectedRows;
};

module.exports = {
  getGiftsByReceiverId,
  getGiftDetailById,
  updateGiftStatusToUsed
};
