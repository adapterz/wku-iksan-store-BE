jest.mock('../../../db/pool', () => ({ query: jest.fn(), getConnection: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/sanctionModel');

let connection;
beforeEach(() => {
  jest.resetAllMocks();
  connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
  pool.getConnection.mockResolvedValue(connection);
});

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

test('정지 등록도 유저 행을 잠그고 트랜잭션 안에서 처리 (탈퇴와의 경합 방지)', async () => {
  const row = { id: 11, user_id: 5, type: 'suspension', reason: '사유', issued_by: 1, ends_at: null, status: 'active' };
  connection.query
    .mockResolvedValueOnce([[{ id: 5 }]])       // SELECT ... FOR UPDATE
    .mockResolvedValueOnce([{ insertId: 11 }])  // INSERT
    .mockResolvedValueOnce([[row]]);            // getSanctionById

  const result = await model.createSanction(5, 1, { type: 'suspension', reason: '사유', endsAt: null });

  expect(result).toEqual(row);
  expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(connection.query.mock.calls[1][1]).toEqual([5, 'suspension', '사유', 1, null]);
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.release).toHaveBeenCalledTimes(1);
  expect(pool.query).not.toHaveBeenCalled();
});

describe('getActiveSuspension', () => {
  test('제재 이력이 없으면 null', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await model.getActiveSuspension(5)).toBeNull();
    expect(pool.query.mock.calls[0][0]).toContain("type = 'suspension'");
    expect(pool.query.mock.calls[0][0]).toContain("status = 'active'");
  });

  test('만료되지 않은 활성 정지가 있으면 그 행을 반환', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    const row = { id: 1, user_id: 5, type: 'suspension', status: 'active', ends_at: future };
    pool.query.mockResolvedValueOnce([[row]]);

    expect(await model.getActiveSuspension(5)).toEqual(row);
  });

  test('ends_at이 이미 지났으면 status가 active여도 null (자연 만료, SQL NOW() 대신 Node 시계로 판단)', async () => {
    const past = new Date(Date.now() - 1000 * 60 * 60);
    const row = { id: 1, user_id: 5, type: 'suspension', status: 'active', ends_at: past };
    pool.query.mockResolvedValueOnce([[row]]);

    expect(await model.getActiveSuspension(5)).toBeNull();
  });
});

describe('경고 등록 (동시 요청 방지)', () => {
  const row = { id: 11, user_id: 5, type: 'warning', reason: '사유', issued_by: 1, ends_at: null, status: 'active' };

  test('유저 행을 잠그고 트랜잭션 안에서 재확인 후 등록', async () => {
    connection.query
      .mockResolvedValueOnce([[{ id: 5 }]])       // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([[{ total: 0 }]])    // countWarnings 재확인
      .mockResolvedValueOnce([{ insertId: 11 }])  // INSERT
      .mockResolvedValueOnce([[row]]);            // getSanctionById

    const result = await model.createSanction(5, 1, { type: 'warning', reason: '사유', endsAt: null });

    expect(result).toEqual(row);
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('잠금 후 재확인에서 이미 경고가 있으면 WARNING_LIMIT_EXCEEDED로 rollback (동시 요청 방지)', async () => {
    connection.query
      .mockResolvedValueOnce([[{ id: 5 }]])       // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([[{ total: 1 }]]);   // countWarnings 재확인 — 이미 존재

    await expect(model.createSanction(5, 1, { type: 'warning', reason: '사유', endsAt: null }))
      .rejects.toMatchObject({ sanctionError: 'WARNING_LIMIT_EXCEEDED' });

    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
