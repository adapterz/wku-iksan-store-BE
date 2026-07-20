const pool = require('../pool');

const createOrder = async (userId, productId, receiverId, totalPrice, message, isSelfGift) => {
  const [result] = await pool.query(
    `INSERT INTO orders 
      (user_id, product_id, receiver_id, total_price, message, is_self_gift, payment_status) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, productId, receiverId, totalPrice, message, isSelfGift, 'paid']
  );
  return result.insertId;
};

const createGift = async (orderId, barcode) => {
  const [result] = await pool.query(
    `INSERT INTO gifts (order_id, barcode, status) VALUES (?, ?, ?)`,
    [orderId, barcode, 'unused']
  );
  return result.insertId;
};

const getOrderById = async (orderId) => {
  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  return rows.length > 0 ? rows[0] : null;
};

const getGiftByOrderId = async (orderId) => {
  const [rows] = await pool.query('SELECT * FROM gifts WHERE order_id = ?', [orderId]);
  return rows.length > 0 ? rows[0] : null;
};

module.exports = {
  createOrder,
  createGift,
  getOrderById,
  getGiftByOrderId
};
