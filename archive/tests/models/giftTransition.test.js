jest.mock('../../../db/pool', () => ({ getConnection: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/giftModel');
let conn;
const gift = { order_id: 5, receiver_id: 1, status: 'unused', payment_status: 'paid' };
beforeEach(() => {
  conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
  pool.getConnection.mockResolvedValue(conn);
});
function prepare(g) {
  conn.query.mockResolvedValueOnce([[{ id: 1 }]]).mockResolvedValueOnce([g ? [g] : []]);
}
test.each([
  [null, 'GIFT_NOT_FOUND'],
  [{ ...gift, receiver_id: 2 }, 'FORBIDDEN_NOT_OWNER'],
  [{ ...gift, receiver_id: 2, status: 'cancelled' }, 'FORBIDDEN_NOT_OWNER'],
  [{ ...gift, status: 'used' }, 'GIFT_ALREADY_USED'],
  [{ ...gift, payment_status: 'pending' }, 'GIFT_NOT_CANCELLABLE']
])('취소 불가 시 DB를 변경하지 않는다: %j', async (g, errorCode) => {
  prepare(g);
  expect(await model.cancelGift(1, 7)).toEqual({ errorCode });
  expect(conn.query).toHaveBeenCalledTimes(2);
});
test('취소는 주문과 교환권만 같은 트랜잭션에서 변경', async () => {
  prepare(gift);
  const now = new Date();
  conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[{ status: 'cancelled', cancelled_at: now }]]);
  expect(await model.cancelGift(1, 7)).toEqual({ data: { giftId: 7, status: 'cancelled', cancelledAt: now } });
  const queries = conn.query.mock.calls;
  expect(queries[0][0]).toMatch(/FROM users WHERE id = \? FOR UPDATE/);
  expect(queries[1][0]).toMatch(/JOIN orders[\s\S]+FOR UPDATE/);
  expect(queries[2]).toEqual([expect.stringContaining("UPDATE orders SET payment_status = 'cancelled'"), [5]]);
  expect(queries[3]).toEqual([expect.stringContaining("UPDATE gifts SET status = 'cancelled'"), [7]]);
  expect(conn.commit).toHaveBeenCalledTimes(1);
});
test('재취소는 최초 시각 유지, 사용은 거절', async () => {
  const now = new Date();
  const cancelled = { ...gift, status: 'cancelled', payment_status: 'cancelled', cancelled_at: now };
  prepare(cancelled);
  expect((await model.cancelGift(1, 7)).data.cancelledAt).toEqual(now);
  prepare(cancelled);
  expect(await model.useGift(1, 7)).toEqual({ errorCode: 'GIFT_CANCELLED' });
  expect(conn.query).toHaveBeenCalledTimes(4);
});
test('사용 성공 시 주문을 변경하지 않는다', async () => {
  prepare(gift);
  const now = new Date();
  conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ status: 'used', used_at: now }]]);
  expect(await model.useGift(1, 7)).toEqual({ data: { giftId: 7, status: 'used', usedAt: now } });
  expect(conn.query.mock.calls[2][0]).toContain("UPDATE gifts SET status = 'used'");
});
test('주문 변경 직후 교환권 변경 실패는 롤백한다', async () => {
  prepare(gift);
  conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockRejectedValueOnce(new Error('injected'));
  await expect(model.cancelGift(1, 7)).rejects.toThrow('injected');
  expect(conn.rollback).toHaveBeenCalledTimes(1);
  expect(conn.commit).not.toHaveBeenCalled();
  expect(conn.release).toHaveBeenCalledTimes(1);
});
