const pool = require('../pool');
const { reject } = require('../../validators/cartValidator');
async function transaction(work) {
  // DB가 전체 트랜잭션을 취소한 deadlock만 최대 3회. 네트워크/COMMIT 결과 불명은 자동 반복하지 않는다.
  for (let attempt = 0; attempt < 3; attempt++) {
    const connection = await pool.getConnection();
    let started = false;
    try {
      await connection.beginTransaction(); started = true;
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      if (started) {
        try { await connection.rollback(); } catch (rollbackError) {
          console.error('Cart rollback failed:', { code: rollbackError.code });
        }
      }
      if (error.code === 'ER_LOCK_DEADLOCK' && attempt < 2) continue;
      throw error;
    } finally { connection.release(); }
  }
}
async function lockUsers(connection, userId, receiverId = userId, requireReceiver = true) {
  const users = new Map();
  // 서로 선물하는 요청도 같은 회원 ID 순서를 따른다. cart → member 역순은 만들지 않는다.
  for (const id of [...new Set([userId, receiverId])].sort((a, b) => a - b)) {
    const [rows] = await connection.query('SELECT id, nickname FROM users WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length && (id === userId || requireReceiver)) reject(id === userId ? 'UNAUTHORIZED' : 'RECEIVER_NOT_FOUND');
    if (rows.length) users.set(id, rows[0]);
  }
  return users;
}
module.exports = { transaction, lockUsers };
