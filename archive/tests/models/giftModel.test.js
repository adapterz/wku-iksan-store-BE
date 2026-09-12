jest.mock('../../../db/pool', () => ({ query: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/giftModel');
beforeEach(() => jest.resetAllMocks());

test.each(['list', 'detail'])('선물 %s는 상품 ID와 숨김 포함 리뷰 ID 조회', async kind => {
  pool.query.mockResolvedValue([[]]);
  if (kind === 'list') await model.getGiftsByReceiverId(1, 'used');
  else await model.getGiftDetailById(7);
  const [sql, params] = pool.query.mock.calls[0];
  expect(sql).toContain('p.id as product_id');
  expect(sql).toContain('o.payment_status');
  expect(sql).toContain('r.id as review_id');
  expect(sql).toContain('LEFT JOIN reviews r ON r.gift_id = g.id');
  expect(sql).not.toMatch(/r\.status/);
  expect(sql).not.toContain('JOIN users');
  expect(params).toEqual(kind === 'list' ? [1, 'used'] : [7]);
});

test.each([
  ['self', 1],
  ['received', 0]
])('getGiftsByReceiverId type=%s는 is_self_gift 조건과 해당 값을 추가한다', async (type, expectedFlag) => {
  pool.query.mockResolvedValue([[]]);
  await model.getGiftsByReceiverId(1, undefined, type);
  const [sql, params] = pool.query.mock.calls[0];
  expect(sql).toContain('AND o.is_self_gift = ?');
  expect(params).toEqual([1, expectedFlag]);
});

test('status와 type을 함께 주면 두 조건과 파라미터가 모두 추가된다', async () => {
  pool.query.mockResolvedValue([[]]);
  await model.getGiftsByReceiverId(1, 'unused', 'received');
  const [sql, params] = pool.query.mock.calls[0];
  expect(sql).toContain('AND g.status = ?');
  expect(sql).toContain('AND o.is_self_gift = ?');
  expect(params).toEqual([1, 'unused', 0]);
});

test('알 수 없는 type 값은 조건을 추가하지 않는다', async () => {
  pool.query.mockResolvedValue([[]]);
  await model.getGiftsByReceiverId(1, undefined, 'weird');
  const [, params] = pool.query.mock.calls[0];
  expect(params).toEqual([1]);
});
