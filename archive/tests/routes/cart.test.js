const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
jest.mock('../../../db/models/cartModel');
jest.mock('../../../db/models/orderGroupModel');
const cart = require('../../../db/models/cartModel');
const groups = require('../../../db/models/orderGroupModel');
const cartRouter = require('../../../routes/cartItems');
const groupRouter = require('../../../routes/orderGroups');
const app = (group = false, logged = true) => createTestApp(group ? '/api/order-groups' : '/api/cart-items', group ? groupRouter : cartRouter, { session: logged ? { userId: 1 } : {} });
beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());
test.each([['get',''], ['post',''], ['patch','/1'], ['delete','/1'], ['post','/remove']])('cart %s%s requires auth', async (method, url) => {
  const res = await request(app(false, false))[method]('/api/cart-items' + url).send({});
  expect(res.status).toBe(401); expect(res.headers['cache-control']).toBe('private, no-store');
});
test.each([['get','/1'], ['post','']])('group %s auth', async (method, url) => {
  expect((await request(app(true, false))[method]('/api/order-groups' + url).send({})).status).toBe(401);
});
test('cart valid routes forward only session owner and validated values', async () => {
  cart.list.mockResolvedValue([]); cart.add.mockResolvedValue({ cartItemId: 1 });
  cart.update.mockResolvedValue({ cartItemId: 1 }); cart.remove.mockResolvedValue({ itemIds: [1] });
  expect((await request(app()).get('/api/cart-items')).body.data).toEqual([]);
  expect((await request(app()).post('/api/cart-items').send({ productId: 2, quantity: 3 })).status).toBe(201);
  expect(cart.add).toHaveBeenCalledWith(1, { productId: 2, quantity: 3 });
  expect((await request(app()).patch('/api/cart-items/1').send({ quantity: 1, version: 2 })).status).toBe(200);
  expect(cart.update).toHaveBeenCalledWith(1, 1, { quantity: 1, version: 2 });
  expect((await request(app()).post('/api/cart-items/remove').send({ itemIds: [3, 1] })).status).toBe(200);
  expect(cart.remove).toHaveBeenLastCalledWith(1, [1, 3]);
  await request(app()).delete('/api/cart-items/1'); expect(cart.remove).toHaveBeenLastCalledWith(1, [1]);
});
test('group create hash and idempotency key stay internal', async () => {
  groups.create.mockResolvedValue({ orderGroupId: 1 });
  const res = await request(app(true)).post('/api/order-groups').set('Idempotency-Key', 'request-123456789')
    .send({ items: [{ cartItemId: 1, quantity: 1, version: 1, expectedUnitPrice: 1000 }], isSelfGift: true });
  expect(res.status).toBe(201); expect(res.body.data).toEqual({ orderGroupId: 1 });
  expect(groups.create.mock.calls[0][0]).toBe(1);
  expect(groups.create.mock.calls[0][1]).toMatchObject({ receiverId: 1, key: 'request-123456789', hash: expect.any(String) });
});
test.each(['0', 'abc', '1.5'])('bad id %s', async id => {
  expect((await request(app()).delete('/api/cart-items/' + id)).status).toBe(400);
  expect((await request(app(true)).get('/api/order-groups/' + id)).status).toBe(400);
});
test('domain conflict gives item reasons; unknown DB errors sanitized', async () => {
  const data = { items: [{ cartItemId: 1, reason: 'CART_CHANGED' }] };
  cart.update.mockRejectedValue({ cartError: 'CART_CHANGED', data });
  const res = await request(app()).patch('/api/cart-items/1').send({ quantity: 1, version: 1 });
  expect(res.status).toBe(409); expect(res.body.data).toEqual(data);
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  cart.list.mockRejectedValue({ code: 'DB_ERROR', sql: 'secret' });
  const failed = await request(app()).get('/api/cart-items');
  expect(failed.status).toBe(500); expect(JSON.stringify(failed.body)).not.toContain('secret');
  expect(spy).toHaveBeenCalledWith('Cart operation failed:', { code: 'DB_ERROR' });
});
