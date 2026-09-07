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
