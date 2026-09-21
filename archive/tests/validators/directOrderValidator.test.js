const { validateDirectOrder: validate } = require('../../../validators/directOrderValidator');
const { validateGroup } = require('../../../validators/cartValidator');
const key = 'direct-request-123456';
const body = { productId: 2, quantity: 3, expectedUnitPrice: 1000, isSelfGift: false, receiverId: 2 };
function rejects(value, code, ...keys) {
  const requestKey = keys.length ? keys[0] : key;
  try { validate(value, requestKey, 1); throw new Error('expected validation failure'); }
  catch (error) { expect(error.cartError).toBe(code); }
}
test.each([1, 10])('quantity %i supported by same contract', quantity => {
  expect(validate({ ...body, quantity }, key, 1)).toMatchObject({ ...body, quantity, key, hash: expect.any(String) });
});
test.each([undefined, null, 0, -1, 1.5, '3', true, {}, [], NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('invalid quantity %p', quantity => {
  rejects({ ...body, quantity }, 'INVALID_QUANTITY');
});
test('quantity over product limit', () => rejects({ ...body, quantity: 11 }, 'ORDER_QUANTITY_EXCEEDED'));
test.each([undefined, '', 'short', 'x'.repeat(65), 'request!123456789', 123])('invalid key %p', value => rejects(body, 'INVALID_IDEMPOTENCY_KEY', value));
test.each([null, [], 'body', { ...body, userId: 9 }, { ...body, cartItemId: 3 },
  { ...body, productId: '2' }, { ...body, productId: 0 }, { ...body, isSelfGift: 'false' },
  { ...body, expectedUnitPrice: 0 }, { ...body, expectedUnitPrice: '1000' },
  { ...body, expectedUnitPrice: 2147483648 }, { ...body, receiverId: '2' },
  { ...body, receiverId: undefined }, { ...body, message: {} }, { ...body, message: '😀'.repeat(501) }])('invalid body %p', value => {
  rejects(value, 'INVALID_DIRECT_ORDER_BODY');
});
test('recipient cannot be spoofed for self gift or selected self for non-self gift', () => {
  rejects({ ...body, receiverId: 1 }, 'CANNOT_GIFT_TO_SELF');
  rejects({ ...body, isSelfGift: true }, 'INVALID_DIRECT_ORDER_BODY');
  expect(validate({ ...body, isSelfGift: true, receiverId: undefined }, key, 1).receiverId).toBe(1);
});
test('normalization gives deterministic hash independent of key order and optional defaults', () => {
  const first = validate({ ...body, message: ' hello ' }, key, 1);
  const second = validate({ message: 'hello', receiverId: 2, isSelfGift: false, expectedUnitPrice: 1000, quantity: 3, productId: 2 }, 'another-key-123456', 1);
  expect(first.hash).toBe(second.hash);
  expect(validate({ ...body, message: null }, key, 1).hash).toBe(validate(body, key, 1).hash);
  expect(validate({ ...body, message: '😀'.repeat(500) }, key, 1).message).toHaveLength(1000);
});
test.each([{ quantity: 4 }, { productId: 3 }, { expectedUnitPrice: 2000 }, { receiverId: 3 }, { message: 'changed' }, { isSelfGift: true, receiverId: 1 }])('different intent changes hash %p', change => {
  expect(validate({ ...body, ...change }, key, 1).hash).not.toBe(validate(body, key, 1).hash);
});
test('cart and direct requests cannot replay one another with the same key', () => {
  const cart = validateGroup({ items: [{ cartItemId: 2, quantity: 3, version: 1, expectedUnitPrice: 1000 }], isSelfGift: false, receiverId: 2 }, key, 1);
  expect(cart.hash).not.toBe(validate(body, key, 1).hash);
});
