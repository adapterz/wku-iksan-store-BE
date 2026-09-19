const crypto = require('node:crypto');
const { MAX_QUANTITY } = require('../constants/cart');
const { reject } = require('./cartValidator');
const positive = value => Number.isSafeInteger(value) && value > 0;

function validateDirectOrder(body, key, userId) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) reject('INVALID_IDEMPOTENCY_KEY');
  const fields = ['productId', 'quantity', 'expectedUnitPrice', 'isSelfGift', 'receiverId', 'message'];
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(field => !fields.includes(field))) reject('INVALID_DIRECT_ORDER_BODY');
  if (!positive(body.quantity)) reject('INVALID_QUANTITY');
  if (body.quantity > MAX_QUANTITY) reject('ORDER_QUANTITY_EXCEEDED');
  if (!positive(body.productId) || !positive(body.expectedUnitPrice) || body.expectedUnitPrice > 2147483647 ||
      typeof body.isSelfGift !== 'boolean') reject('INVALID_DIRECT_ORDER_BODY');
  if (!body.isSelfGift && !positive(body.receiverId)) reject('INVALID_DIRECT_ORDER_BODY');
  if (!body.isSelfGift && body.receiverId === userId) reject('CANNOT_GIFT_TO_SELF');
  if (body.isSelfGift && body.receiverId !== undefined && body.receiverId !== userId) reject('INVALID_DIRECT_ORDER_BODY');
  if (body.message !== undefined && body.message !== null && typeof body.message !== 'string') reject('INVALID_DIRECT_ORDER_BODY');
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if ([...message].length > 500) reject('INVALID_DIRECT_ORDER_BODY');
  const value = { productId: body.productId, quantity: body.quantity, expectedUnitPrice: body.expectedUnitPrice,
    isSelfGift: body.isSelfGift, receiverId: body.isSelfGift ? userId : body.receiverId, message: message || null };
  // 같은 회원의 키 공간은 장바구니 주문과 공유한다. 다른 경로의 요청을 재사용하지 않는다.
  const hash = crypto.createHash('sha256').update(JSON.stringify({ source: 'direct', ...value })).digest('hex');
  return { ...value, key, hash };
}
module.exports = { validateDirectOrder };
