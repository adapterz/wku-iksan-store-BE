const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../db/pool');
const orderModel = require('../db/models/orderModel');

const input = [1, 2, 3, 4500, '선물 메시지', false, '123456789012'];

const withMockConnection = async (connection, callback) => {
  const originalGetConnection = pool.getConnection;
  pool.getConnection = async () => connection;

  try {
    await callback();
  } finally {
    pool.getConnection = originalGetConnection;
  }
};

test('주문과 선물 생성이 모두 성공하면 커밋하고 생성 ID를 반환한다', async () => {
  const calls = [];
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      calls.push(sql.includes('INSERT INTO orders') ? 'order' : 'gift');
      return [{ insertId: sql.includes('INSERT INTO orders') ? 10 : 20 }];
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  };

  await withMockConnection(connection, async () => {
    const result = await orderModel.createOrderWithGift(...input);

    assert.deepEqual(result, { orderId: 10, giftId: 20 });
    assert.deepEqual(calls, ['begin', 'order', 'gift', 'commit', 'release']);
  });
});

test('선물 생성이 실패하면 주문까지 롤백하고 연결을 반환한다', async () => {
  const calls = [];
  const expectedError = new Error('gift insert failed');
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    query: async (sql) => {
      if (sql.includes('INSERT INTO orders')) {
        calls.push('order');
        return [{ insertId: 10 }];
      }

      calls.push('gift');
      throw expectedError;
    },
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release')
  };

  await withMockConnection(connection, async () => {
    await assert.rejects(
      orderModel.createOrderWithGift(...input),
      (error) => error === expectedError
    );
    assert.deepEqual(calls, ['begin', 'order', 'gift', 'rollback', 'release']);
  });
});
