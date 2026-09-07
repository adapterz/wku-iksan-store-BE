jest.mock('../../../db/pool', () => ({ query: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/sanctionModel');

beforeEach(() => jest.resetAllMocks());

describe('liftSanction', () => {
  test('없는 제재는 null 반환, UPDATE 시도 안 함', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await model.liftSanction(999)).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('active 상태면 UPDATE 후 최신 행을 다시 조회', async () => {
    const active = { id: 10, status: 'active' };
    const lifted = { id: 10, status: 'lifted' };
    pool.query
      .mockResolvedValueOnce([[active]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[lifted]]);

    const result = await model.liftSanction(10);

    expect(result).toEqual(lifted);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[1][0]).toContain('UPDATE');
  });

  test('이미 lifted면 UPDATE 없이 그대로 반환 (재시도에도 멱등)', async () => {
    const lifted = { id: 10, status: 'lifted' };
    pool.query.mockResolvedValueOnce([[lifted]]);

    const result = await model.liftSanction(10);

    expect(result).toEqual(lifted);
    // SELECT 한 번뿐, UPDATE 쿼리는 실행되지 않아야 한다.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});

test('countWarnings은 해당 유저의 warning 개수를 반환', async () => {
  pool.query.mockResolvedValueOnce([[{ total: 2 }]]);
  expect(await model.countWarnings(5)).toBe(2);
  expect(pool.query.mock.calls[0][1]).toEqual([5]);
});

test('createSanction은 삽입 후 생성된 행을 반환', async () => {
  const row = { id: 11, user_id: 5, type: 'warning', reason: '사유', issued_by: 1, ends_at: null, status: 'active' };
  pool.query
    .mockResolvedValueOnce([{ insertId: 11 }])
    .mockResolvedValueOnce([[row]]);

  const result = await model.createSanction(5, 1, { type: 'warning', reason: '사유', endsAt: null });

  expect(result).toEqual(row);
  expect(pool.query.mock.calls[0][1]).toEqual([5, 'warning', '사유', 1, null]);
});
