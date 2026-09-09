jest.mock('../../../db/pool', () => ({ query: jest.fn(), getConnection: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/giftModel');
let connection;
beforeEach(() => {
  jest.resetAllMocks();
  connection = { beginTransaction: jest.fn(), query: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
  pool.getConnection.mockResolvedValue(connection);
});

test('목록은 단일 쿼리로 결제·수신자·self·미확인 조건 적용', async () => {
  pool.query.mockResolvedValue([[{ id: 51 }, { id: 52 }]]);
  expect(await model.getUnnotifiedGiftIds(7)).toEqual([51, 52]);
  const [sql, params] = pool.query.mock.calls[0];
  for (const condition of ['o.receiver_id = ?', 'o.is_self_gift = false', "o.payment_status = 'paid'", 'g.notified_at IS NULL', 'ORDER BY g.id ASC']) expect(sql).toContain(condition);
  expect(sql).not.toContain('JOIN users');
  expect(params).toEqual([7]);
});

test('잠금 후 전체 대상 검증, 요청 ID의 NULL 확인 시각만 갱신', async () => {
  connection.query.mockResolvedValueOnce([[{ id: 51 }, { id: 52 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
  expect(await model.notifyGifts(7, [51, 52])).toBe(true);
  const [select, args] = connection.query.mock.calls[0];
  expect(select).toContain('FOR UPDATE');
  expect(select).not.toContain('notified_at IS NULL');
  expect(args).toEqual([7, 51, 52]);
  const [update, ids] = connection.query.mock.calls[1];
  expect(update).toContain('WHERE id IN (?,?) AND notified_at IS NULL');
  expect(ids).toEqual([51, 52]);
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.release).toHaveBeenCalledTimes(1);
});

test('요청 ID 중 하나라도 부적격이면 UPDATE 없이 전체 롤백', async () => {
  connection.query.mockResolvedValueOnce([[{ id: 51 }]]);
  expect(await model.notifyGifts(7, [51, 52])).toBe(false);
  expect(connection.query).toHaveBeenCalledTimes(1);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledTimes(1);
});

test('UPDATE 오류는 롤백 후 전달하고 연결 반환', async () => {
  connection.query.mockResolvedValueOnce([[{ id: 51 }]]).mockRejectedValueOnce(new Error('write failed'));
  await expect(model.notifyGifts(7, [51])).rejects.toThrow('write failed');
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalledTimes(1);
});
