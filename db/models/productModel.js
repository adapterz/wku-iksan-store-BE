const pool = require('../pool');

// LIKE에서 의미가 있는 문자도 사용자가 입력한 일반 문자 그대로 검색한다.
const escapeLikePattern = (keyword) => keyword.replace(/[!%_]/g, character => `!${character}`);

const getAllProducts = async ({ keyword = null, categoryId = null, brand = null } = {}) => {
  const conditions = [];
  const params = [];

  if (keyword !== null) {
    const likePattern = `%${escapeLikePattern(keyword)}%`;
    conditions.push("(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!')");
    params.push(likePattern, likePattern);
  }

  if (categoryId !== null) {
    conditions.push('p.category_id = ?');
    params.push(categoryId);
  }

  if (brand !== null) {
    conditions.push('p.brand = ?');
    params.push(brand);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const query = `
    SELECT
      p.id,
      p.name,
      p.brand,
      p.price,
      p.thumbnail_url,
      p.category_id,
      c.name AS category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    ${whereClause}
  `;

  const [rows] = await pool.query(query, params);
  return rows;
};

// 찜(위시리스트) 개수 기준 인기 상품 상위 N개를 반환한다.
const PRODUCT_RANKING_LIMIT = 10;

const getProductRanking = async () => {
  const [rows] = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.brand,
      p.price,
      p.thumbnail_url,
      p.category_id,
      c.name AS category_name,
      COUNT(w.id) AS wishlist_count
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN wishlists w ON w.product_id = p.id
    GROUP BY p.id, c.name
    HAVING wishlist_count > 0
    ORDER BY wishlist_count DESC, p.id ASC
    LIMIT ?
  `, [PRODUCT_RANKING_LIMIT]);
  return rows;
};

const getProductById = async (id) => {
  const [rows] = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.brand,
      p.price,
      p.thumbnail_url,
      p.description,
      p.usage_info,
      p.category_id,
      c.name AS category_name
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `, [id]);
  return rows.length > 0 ? rows[0] : null;
};

module.exports = {
  PRODUCT_RANKING_LIMIT,
  getAllProducts,
  getProductRanking,
  getProductById
};
