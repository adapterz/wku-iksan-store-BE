const v = require('../../../validators/cartValidator');
const item = { cartItemId: 1, quantity: 2, version: 1, expectedUnitPrice: 1000 };
const body = { items: [item], isSelfGift: false, receiverId: 2, message: ' 선물 ' };
const key = 'order-key-123456789';
test.each([0, -1, 1.5, '1', null, true, {}, [], 11].map(value => [value]))('invalid quantity %p', quantity => {
  expect(() => v.validateAdd({ productId: 1, quantity })).toThrow('INVALID_CART_BODY');
  expect(() => v.validateUpdate({ version: 1, quantity })).toThrow('INVALID_CART_BODY');
});
test.each([null, [], {}, { productId: 1, quantity: 1, userId: 2 }].map(value => [value]))('invalid add body %p', input => {
  expect(() => v.validateAdd(input)).toThrow();
});
test('valid add and update', () => {
  expect(v.validateAdd({ productId: 1, quantity: 10 })).toEqual({ productId: 1, quantity: 10 });
  expect(v.validateUpdate({ quantity: 1, version: 10 }).version).toBe(10);
});
test.each([0, -1, '1', 1.1, Number.MAX_SAFE_INTEGER])('invalid version %p', version => {
  expect(() => v.validateUpdate({ quantity: 1, version })).toThrow();
});
test.each([[], [1, 1], ['1'], [0], Array.from({ length: 31 }, (_, i) => i + 1)].map(value => [value]))('invalid ids %p', itemIds => {
  expect(() => v.validateIds({ itemIds })).toThrow();
});
test('ids are canonical and request is not mutated', () => {
  const ids = [3, 1]; expect(v.validateIds({ itemIds: ids })).toEqual([1, 3]); expect(ids).toEqual([3, 1]);
});
test.each([undefined, '', 'tiny', '한글키'.repeat(8), 'x'.repeat(65), 'a'.repeat(16) + ' '])('invalid key %p', value => {
  expect(() => v.validateGroup(body, value, 1)).toThrow('INVALID_IDEMPOTENCY_KEY');
});
test.each([null, {}, { ...body, isSelfGift: 'false' }, { ...body, receiverId: '2' },
  { ...body, items: [item, item] }, { ...body, message: {} }, { ...body, message: '가'.repeat(501) },
  { ...body, items: [{ ...item, expectedUnitPrice: -1 }] }, { ...body, items: [{ ...item, price: 1 }] },
  { ...body, items: [] }, { ...body, userId: 2 }])('invalid group %p', input => {
  expect(() => v.validateGroup(input, key, 1)).toThrow();
});
test('50 unit limit and self receiver policy', () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ ...item, cartItemId: i + 1, quantity: 10 }));
  expect(() => v.validateGroup({ ...body, items }, key, 1)).toThrow('ORDER_QUANTITY_EXCEEDED');
  expect(() => v.validateGroup({ ...body, receiverId: 1 }, key, 1)).toThrow('CANNOT_GIFT_TO_SELF');
  expect(v.validateGroup({ items: [item], isSelfGift: true }, key, 1).receiverId).toBe(1);
  expect(() => v.validateGroup({ ...body, isSelfGift: true }, key, 1)).toThrow();
});
test('hash ignores item order, changes with semantic payload, preserves key case', () => {
  const second = { ...item, cartItemId: 2 };
  const a = v.validateGroup({ ...body, items: [item, second] }, key, 1);
  expect(v.validateGroup({ ...body, message: '선물', items: [second, item] }, key, 1).hash).toBe(a.hash);
  expect(v.validateGroup({ ...body, items: [item, second], message: '변경' }, key, 1).hash).not.toBe(a.hash);
  expect(v.validateGroup(body, key.toUpperCase(), 1).key).toBe(key.toUpperCase());
});
