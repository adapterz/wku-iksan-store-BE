const pool = require('../pool');

const getAllCategories = async () => {
  const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY id ASC');
  return rows;
};

module.exports = {
  getAllCategories
};
