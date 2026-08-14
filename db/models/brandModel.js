const pool = require('../pool');

// LIKE에서 의미가 있는 문자도 사용자가 입력한 일반 문자 그대로 검색한다.
const escapeLikePattern = (keyword) => keyword.replace(/[!%_]/g, character => `!${character}`);

// keyword가 없을 때(대표 브랜드 모아보기)만 상위 N개로 제한한다.
const DEFAULT_BRAND_LIST_LIMIT = 4;

const getBrands = async ({ keyword = null } = {}) => {
  const conditions = [];
  const params = [];

  if (keyword !== null) {
    const likePattern = `%${escapeLikePattern(keyword)}%`;
    conditions.push("p.brand LIKE ? ESCAPE '!'");
    params.push(likePattern);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const limitClause = keyword === null ? 'LIMIT ?' : '';

  const query = `
    SELECT
      p.brand,
      COUNT(*) AS product_count,
      (
        SELECT p2.thumbnail_url
        FROM products p2
        WHERE p2.brand = p.brand
        ORDER BY p2.id ASC
        LIMIT 1
      ) AS thumbnail_url
    FROM products p
    ${whereClause}
    GROUP BY p.brand
    ORDER BY product_count DESC, p.brand ASC
    ${limitClause}
  `;

  if (keyword === null) {
    params.push(DEFAULT_BRAND_LIST_LIMIT);
  }

  const [rows] = await pool.query(query, params);
  return rows;
};

module.exports = {
  DEFAULT_BRAND_LIST_LIMIT,
  getBrands
};
