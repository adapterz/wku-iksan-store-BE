const pool = require('../pool');

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

const updateUserPassword = async (id, hashedPassword) => {
  await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
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
// 여기서는 users 행만 삭제한다.
const deleteUser = async (id) => {
  await pool.query('DELETE FROM users WHERE id = ?', [id]);
};

module.exports = {
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
