const crypto = require('node:crypto');
const { MAX_ITEMS, MAX_QUANTITY, MAX_UNITS } = require('../constants/cart');
const positive = value => Number.isSafeInteger(value) && value > 0;
const shape = (body, allowed) => body !== null && typeof body === 'object' && !Array.isArray(body) &&
  Object.keys(body).every(key => allowed.includes(key));
const quantity = value => positive(value) && value <= MAX_QUANTITY;
function reject(code, data) { throw Object.assign(new Error(code), { cartError: code, data }); }
function validateAdd(body) {
  if (!shape(body, ['productId', 'quantity']) || !positive(body.productId) || !quantity(body.quantity)) reject('INVALID_CART_BODY');
  return { productId: body.productId, quantity: body.quantity };
}
function validateUpdate(body) {
  if (!shape(body, ['quantity', 'version']) || !quantity(body.quantity) || !positive(body.version) || body.version > 2147483646) reject('INVALID_CART_BODY');
  return { quantity: body.quantity, version: body.version };
}
function validateIds(body) {
  if (!shape(body, ['itemIds']) || !Array.isArray(body.itemIds) || body.itemIds.length < 1 ||
      body.itemIds.length > MAX_ITEMS || !body.itemIds.every(positive) || new Set(body.itemIds).size !== body.itemIds.length) reject('INVALID_CART_BODY');
  return [...body.itemIds].sort((a, b) => a - b);
}
function validateGroup(body, key, userId) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) reject('INVALID_IDEMPOTENCY_KEY');
  if (!shape(body, ['items', 'isSelfGift', 'receiverId', 'message']) || typeof body.isSelfGift !== 'boolean' ||
      !Array.isArray(body.items) || body.items.length < 1 || body.items.length > MAX_ITEMS) reject('INVALID_ORDER_GROUP_BODY');
  if (!body.isSelfGift && !positive(body.receiverId)) reject('INVALID_ORDER_GROUP_BODY');
  if (!body.isSelfGift && body.receiverId === userId) reject('CANNOT_GIFT_TO_SELF');
  if (body.isSelfGift && body.receiverId !== undefined && body.receiverId !== userId) reject('INVALID_ORDER_GROUP_BODY');
  if (body.message !== undefined && body.message !== null && typeof body.message !== 'string') reject('INVALID_ORDER_GROUP_BODY');
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if ([...message].length > 500) reject('INVALID_ORDER_GROUP_BODY');
  const items = body.items.map(item => {
    if (!shape(item, ['cartItemId', 'quantity', 'version', 'expectedUnitPrice']) ||
        !positive(item.cartItemId) || !quantity(item.quantity) || !positive(item.version) ||
        !positive(item.expectedUnitPrice) || item.expectedUnitPrice > 2147483647) reject('INVALID_ORDER_GROUP_BODY');
    return { cartItemId: item.cartItemId, quantity: item.quantity, version: item.version, expectedUnitPrice: item.expectedUnitPrice };
  }).sort((a, b) => a.cartItemId - b.cartItemId);
  if (new Set(items.map(item => item.cartItemId)).size !== items.length) reject('INVALID_ORDER_GROUP_BODY');
  if (items.reduce((sum, item) => sum + item.quantity, 0) > MAX_UNITS) reject('ORDER_QUANTITY_EXCEEDED');
  const value = { items, isSelfGift: body.isSelfGift, receiverId: body.isSelfGift ? userId : body.receiverId, message: message || null };
  return { ...value, key, hash: crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex') };
}
module.exports = { validateAdd, validateUpdate, validateIds, validateGroup, reject };
