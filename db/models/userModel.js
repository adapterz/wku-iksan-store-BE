const pool = require('../pool');
const { MAX_AUTH_VERSION, isValidAuthVersion } = require('../../constants/authVersion');

// 인증 경계에서는 비밀번호/이메일 등 불필요한 필드를 읽지 않는다. 요청 간 캐시 금지.
const getAuthStateById = async (id) => {
  const [rows] = await pool.query('SELECT id, auth_version FROM users WHERE id = ?', [id]);
  return rows[0] || null;
};

const getUserByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows.length > 0 ? rows[0] : null;
};

const getUserByNickname = async (nickname) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE nickname = ?', [nickname]);
  return rows.length > 0 ? rows[0] : null;
};

const getUserById = async (id) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

const createUser = async (email, password, nickname) => {
  const [result] = await pool.query(
    'INSERT INTO users (email, password, nickname) VALUES (?, ?, ?)',
    [email, password, nickname]
  );

  // 방금 생성된 유저 재조회 (id, created_at 등 모든 필드 포함 반환)
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
  return rows[0];
};

const updateUserEmail = async (id, email) => {
  await pool.query('UPDATE users SET email = ? WHERE id = ?', [email, id]);
  return getUserById(id);
};

const updateUserPassword = async (id, hashedPassword, expectedVersion) => {
  if (!isValidAuthVersion(expectedVersion) || expectedVersion === MAX_AUTH_VERSION) {
    throw new Error('AUTH_VERSION_EXHAUSTED_OR_INVALID');
  }
  // InnoDB의 단일 조건부 UPDATE: 비밀번호와 버전은 함께 변경되거나 함께 유지된다.
  const [result] = await pool.query(
    'UPDATE users SET password = ?, auth_version = auth_version + 1 WHERE id = ? AND auth_version = ? AND auth_version < ?',
    [hashedPassword, id, expectedVersion, MAX_AUTH_VERSION]
  );
  return result.affectedRows === 1;
};

const updateUserNickname = async (id, nickname) => {
  await pool.query('UPDATE users SET nickname = ? WHERE id = ?', [nickname, id]);
  return getUserById(id);
};

const updateUserRole = async (id, role) => {
  await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
  return getUserById(id);
};

// orders/wishlists의 FK ON DELETE 정책(SET NULL/CASCADE)이 연쇄 처리를 담당하므로
// 여기서는 users 행만 삭제한다. runner로 트랜잭션 커넥션을 받으면 그 안에서 실행된다
// (usersController.deleteAccount — 유저 행을 잠근 채로 삭제까지 같은 트랜잭션에서 처리).
const deleteUser = async (id, runner = pool) => {
  await runner.query('DELETE FROM users WHERE id = ?', [id]);
};

module.exports = {
  getAuthStateById,
  getUserByEmail,
  getUserByNickname,
  getUserById,
  createUser,
  updateUserEmail,
  updateUserPassword,
  updateUserNickname,
  updateUserRole,
  deleteUser
};
