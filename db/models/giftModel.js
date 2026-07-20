// receiverId 기준 조회, 발신자(sender)는 orders.user_id를 통해 조회
const pool = require('../pool');

const getGiftsByReceiverId = async (receiverId, status) => {
  let query = `
    SELECT 
      g.id as gift_id,
      p.name as product_name,
      p.thumbnail_url as thumbnail_url,
      p.brand as brand,
      g.status as status,
      u.nickname as sender_nickname,
      o.is_self_gift as is_self_gift,
      g.created_at as created_at,
      g.used_at as used_at
    FROM gifts g
    JOIN orders o ON g.order_id = o.id
    JOIN products p ON o.product_id = p.id
    JOIN users u ON o.user_id = u.id
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
      p.name as product_name,
      p.thumbnail_url as thumbnail_url,
      g.barcode,
      g.status,
      g.used_at,
      o.message,
      o.receiver_id,
      o.is_self_gift,
      u.id as sender_id,
      u.nickname as sender_nickname
    FROM gifts g
    JOIN orders o ON g.order_id = o.id
    JOIN products p ON o.product_id = p.id
    JOIN users u ON o.user_id = u.id
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
