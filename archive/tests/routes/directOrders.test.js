const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
jest.mock('../../../db/models/cartModel');
jest.mock('../../../db/models/orderGroupModel');
const groups = require('../../../db/models/orderGroupModel');
const router = require('../../../routes/orderGroups');
const key = 'direct-request-123456';
const body = { productId: 2, quantity: 3, expectedUnitPrice: 1000, isSelfGift: false, receiverId: 2 };
const app = logged => createTestApp('/api/order-groups', router, { session: logged ? { userId: 1 } : {} });
const post = (value = body, logged = true, requestKey = key) => request(app(logged)).post('/api/order-groups/direct').set('Idempotency-Key', requestKey).send(value);
beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());
test('requires authenticated session and prevents caching', async () => {
  const res = await post(body, false);
  expect(res.status).toBe(401);
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(groups.createDirect).not.toHaveBeenCalled();
});
test.each([1, 10])('quantity %i returns same group envelope without request hash/key', async quantity => {
  groups.createDirect.mockResolvedValue({ orderGroupId: 3, totalQuantity: quantity, totalPrice: 1000 * quantity, items: [] });
  const res = await post({ ...body, quantity });
  expect(res.status).toBe(201);
  expect(res.body.code).toBe('ORDER_GROUP_CREATE_SUCCESS');
  expect(res.body.data).toMatchObject({ orderGroupId: 3, totalQuantity: quantity });
  expect(groups.createDirect).toHaveBeenCalledWith(1, expect.objectContaining({ ...body, quantity, key, hash: expect.any(String) }));
  expect(groups.create).not.toHaveBeenCalled();
  expect(JSON.stringify(res.body)).not.toContain(key);
});
test.each([[0, 'INVALID_QUANTITY'], ['3', 'INVALID_QUANTITY'], [11, 'ORDER_QUANTITY_EXCEEDED']])('quantity %p rejected before model', async (quantity, code) => {
  const res = await post({ ...body, quantity });
  expect(res.status).toBe(400); expect(res.body.code).toBe(code);
  expect(groups.createDirect).not.toHaveBeenCalled();
});
test('required header and display price validated; sender cannot come from body', async () => {
  expect((await post(body, true, '')).body.code).toBe('INVALID_IDEMPOTENCY_KEY');
  expect((await post({ ...body, expectedUnitPrice: undefined })).body.code).toBe('INVALID_DIRECT_ORDER_BODY');
  expect((await post({ ...body, userId: 9 })).body.code).toBe('INVALID_DIRECT_ORDER_BODY');
  expect(groups.createDirect).not.toHaveBeenCalled();
});
test.each(['PRODUCT_PRICE_CHANGED', 'PRODUCT_UNAVAILABLE', 'IDEMPOTENCY_KEY_REUSED'])('domain conflict %s', async code => {
  groups.createDirect.mockRejectedValue({ cartError: code });
  const res = await post(); expect(res.status).toBe(409); expect(res.body.code).toBe(code);
});
test.each(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])('bounded concurrency failure %s', async code => {
  groups.createDirect.mockRejectedValue({ code });
  const res = await post(); expect(res.status).toBe(409); expect(res.body.code).toBe('CART_BUSY');
});
test('unexpected errors do not expose SQL or key', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  groups.createDirect.mockRejectedValue({ code: 'DB_ERROR', sql: 'secret', message: key });
  const res = await post(); expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toMatch(/secret|direct-request/);
});
test('detail is retrieved with existing owner-scoped endpoint', async () => {
  groups.get.mockResolvedValue({ orderGroupId: 3 });
  const res = await request(app(true)).get('/api/order-groups/3');
  expect(res.status).toBe(200); expect(groups.get).toHaveBeenCalledWith(1, 3);
});
