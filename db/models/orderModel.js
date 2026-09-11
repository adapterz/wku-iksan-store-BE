const pool = require('../pool');
const { transaction, lockUsers } = require('./cartTransaction');
const { insertOrderWithGift } = require('./orderWriter');
const { reject } = require('../../validators/cartValidator');

// 기존 단건 호출/응답 형식 유지. 닉네임 인자는 호환용이며 잠금 안에서 최신값을 읽는다.
const createOrderWithGift = async (userId, senderNickname, productId, receiverId,
  receiverNickname, totalPrice, message, isSelfGift, barcode) => transaction(async connection => {
  const senderId = Number(userId), recipientId = Number(receiverId);
  const users = await lockUsers(connection, senderId, recipientId);
  const [products] = await connection.query('SELECT id, name, brand, thumbnail_url, price, status FROM products WHERE id = ? FOR UPDATE', [productId]);
  if (!products.length) reject('PRODUCT_NOT_FOUND');
  const product = products[0];
  if (product.status !== 'active') reject('PRODUCT_UNAVAILABLE');
  if (product.price !== totalPrice) reject('PRODUCT_PRICE_CHANGED');
  if (!Number.isSafeInteger(product.price) || product.price <= 0) reject('INVALID_PRODUCT_PRICE');
  return insertOrderWithGift(connection, { userId: senderId, senderNickname: users.get(senderId).nickname,
    receiverId: recipientId, receiverNickname: users.get(recipientId).nickname, product,
    message, isSelfGift }, barcode);
});
const getOrderById = async orderId => {
  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  return rows[0] || null;
};
const getGiftByOrderId = async orderId => {
  const [rows] = await pool.query('SELECT * FROM gifts WHERE order_id = ?', [orderId]);
  return rows[0] || null;
};
module.exports = { createOrderWithGift, getOrderById, getGiftByOrderId };
