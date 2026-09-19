jest.mock('../../../db/pool', () => ({ query: jest.fn(), getConnection: jest.fn() }));
const pool = require('../../../db/pool');
const groups = require('../../../db/models/orderGroupModel');
const { validateDirectOrder } = require('../../../validators/directOrderValidator');
const raw = { productId: 3, quantity: 2, expectedUnitPrice: 1000, isSelfGift: false, receiverId: 2 };
let db, state, body;
beforeEach(() => {
  jest.resetAllMocks();
  body = validateDirectOrder(raw, 'model-request-1234567', 1);
  state = { product: { id: 3, name: 'coffee', brand: 'brand', thumbnail_url: null, price: 1000, status: 'active' }, rows: [], group: null, failGift: false, missingReceiver: false };
  db = { beginTransaction: jest.fn().mockResolvedValue(), commit: jest.fn().mockResolvedValue(), rollback: jest.fn().mockResolvedValue(), release: jest.fn(), query: jest.fn() };
  pool.getConnection.mockResolvedValue(db);
  pool.query.mockResolvedValue([[]]);
  db.query.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM users')) return [state.missingReceiver && args[0] === 2 ? [] : [{ id: args[0], nickname: 'user-' + args[0] }]];
    if (sql.includes('idempotency_key =')) return [state.group ? [state.group] : []];
    if (sql.includes('FROM products')) return [state.product ? [state.product] : []];
    if (sql.includes('INSERT INTO order_groups')) {
      state.group = { id: 10, user_id: args[0], receiver_id: args[1], sender_nickname_snapshot: args[2], receiver_nickname_snapshot: args[3], message: args[4], is_self_gift: args[5], total_price: args[6], payment_status: 'paid', request_hash: args[8] };
      return [{ insertId: 10 }];
    }
    if (sql.includes('INSERT INTO orders')) {
      for (let i = 0; i < args.length; i += 12) {
        const orderId = state.rows.length + 100;
        state.rows.push({ order_id: orderId, product_id: args[i + 2], total_price: args[i + 5], product_name_snapshot: args[i + 9], brand_snapshot: args[i + 10], thumbnail_url_snapshot: args[i + 11] });
      }
      return [{}];
    }
    if (sql.includes('SELECT id FROM orders WHERE order_group_id')) return [state.rows.map(row => ({ id: row.order_id }))];
    if (sql.includes('INSERT INTO gifts')) {
      if (state.failGift) throw Object.assign(new Error('fixture'), { code: 'ER_SIGNAL_EXCEPTION' });
      for (let i = 0; i < args.length; i += 2) {
        const row = state.rows.find(row => row.order_id === args[i]); row.gift_id = args[i] + 100;
      }
      return [{}];
    }
    if (sql.includes('SELECT id, order_id FROM gifts')) return [state.rows.map(row => ({ id: row.gift_id, order_id: row.order_id }))];
    if (sql.includes('FROM orders o JOIN gifts')) return [state.rows];
    if (sql.includes('SELECT * FROM order_groups')) return [[state.group]];
    throw new Error('Unexpected SQL: ' + sql);
  });
});
test('locks members then product; writes one group and each unit; never accesses cart', async () => {
  const result = await groups.createDirect(1, body);
  expect(result).toMatchObject({ orderGroupId: 10, totalQuantity: 2, totalPrice: 2000, items: [{ productId: 3, quantity: 2, subtotal: 2000, units: [{ orderId: 100, giftId: 200 }, { orderId: 101, giftId: 201 }] }] });
  const queries = db.query.mock.calls.map(call => call[0]);
  expect(queries[0]).toContain('FROM users'); expect(queries[1]).toContain('FROM users');
  expect(queries[2]).toContain('FOR UPDATE'); expect(queries[3]).toContain('FROM products'); expect(queries[3]).toContain('FOR UPDATE');
  expect(queries.join(' ')).not.toContain('cart_items');
  expect(db.commit).toHaveBeenCalledTimes(1); expect(db.rollback).not.toHaveBeenCalled(); expect(db.release).toHaveBeenCalledTimes(1);
});
test('later unit failure rolls back entire transaction and is not retried', async () => {
  state.failGift = true;
  await expect(groups.createDirect(1, body)).rejects.toMatchObject({ code: 'ER_SIGNAL_EXCEPTION' });
  expect(db.commit).not.toHaveBeenCalled(); expect(db.rollback).toHaveBeenCalledTimes(1); expect(db.release).toHaveBeenCalledTimes(1);
  expect(pool.getConnection).toHaveBeenCalledTimes(1);
});
test.each([
  [null, 'PRODUCT_NOT_FOUND'],
  [{ status: 'hidden' }, 'PRODUCT_UNAVAILABLE'],
  [{ status: 'discontinued' }, 'PRODUCT_UNAVAILABLE'],
  [{ price: 2000 }, 'PRODUCT_PRICE_CHANGED'],
  [{ price: 0 }, 'INVALID_PRODUCT_PRICE'],
  [{ price: 2147483648 }, 'INVALID_PRODUCT_PRICE']
])('product rejection %p does not write', async (change, code) => {
  state.product = change === null ? null : { ...state.product, ...change };
  await expect(groups.createDirect(1, body)).rejects.toMatchObject({ cartError: code });
  expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
  expect(db.rollback).toHaveBeenCalledTimes(1);
});
test('missing receiver rejects a fresh order', async () => {
  state.missingReceiver = true;
  await expect(groups.createDirect(1, body)).rejects.toMatchObject({ cartError: 'RECEIVER_NOT_FOUND' });
  expect(db.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
});
test('request arriving during another commit rechecks under lock before current product/recipient state', async () => {
  state.group = { id: 10, request_hash: body.hash };
  state.missingReceiver = true;
  const result = await groups.createDirect(1, body);
  expect(result.orderGroupId).toBe(10);
  expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM products') || sql.includes('INSERT'))).toBe(false);
});
test('fast replay uses stored snapshot and no write transaction', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 10, request_hash: body.hash, total_price: 1000 }]]).mockResolvedValueOnce([[{ product_id: 3, total_price: 1000, product_name_snapshot: 'snapshot', order_id: 100, gift_id: 200 }]]);
  const result = await groups.createDirect(1, body);
  expect(result.items[0].name).toBe('snapshot'); expect(pool.getConnection).not.toHaveBeenCalled();
});
test('same key with a different intent is rejected before starting transaction', async () => {
  pool.query.mockResolvedValueOnce([[{ id: 10, request_hash: 'other' }]]);
  await expect(groups.createDirect(1, body)).rejects.toMatchObject({ cartError: 'IDEMPOTENCY_KEY_REUSED' });
  expect(pool.getConnection).not.toHaveBeenCalled();
});
