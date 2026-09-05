const pool = require('../pool');

const getAllCategories = async () => {
  const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY id ASC');
  return rows;
};

const getCategoryById = async (id) => {
  const [rows] = await pool.query('SELECT id, name FROM categories WHERE id = ?', [id]);
  return rows.length > 0 ? rows[0] : null;
};

const createCategory = async (name) => {
  const [result] = await pool.query('INSERT INTO categories (name) VALUES (?)', [name]);
  return getCategoryById(result.insertId);
};

const updateCategory = async (id, name) => {
  const [result] = await pool.query('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
  if (result.affectedRows === 0) {
    return null;
  }
  return getCategoryById(id);
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory
};
