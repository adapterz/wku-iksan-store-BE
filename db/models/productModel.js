const pool = require('../pool');

// LIKE에서 의미가 있는 문자도 사용자가 입력한 일반 문자 그대로 검색한다.
const escapeLikePattern = (keyword) => keyword.replace(/[!%_]/g, character => `!${character}`);

const getAllProducts = async ({ keyword = null, categoryId = null, brand = null } = {}) => {
  const conditions = [];
  const params = [];
  const relevanceParams = [];
  let orderByClause = '';

  if (keyword !== null) {
    // 공백으로 나눈 모든 단어가 상품명 또는 브랜드명 중 하나에 포함되어야 한다.
    const searchTerms = keyword.split(/\s+/).filter(Boolean);

    searchTerms.forEach(term => {
      const likePattern = `%${escapeLikePattern(term)}%`;
      conditions.push("(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!')");
      params.push(likePattern, likePattern);
    });

    // 여러 공백은 하나로 통일해 전체 검색어의 일치 정도를 정렬에 사용한다.
    const normalizedKeyword = searchTerms.join(' ');
    const escapedKeyword = escapeLikePattern(normalizedKeyword);
    const startsWithPattern = `${escapedKeyword}%`;
    const containsPattern = `%${escapedKeyword}%`;

    orderByClause = `
      ORDER BY CASE
        WHEN p.name = ? THEN 1
        WHEN p.brand = ? THEN 2
        WHEN p.name LIKE ? ESCAPE '!' THEN 3
        WHEN p.brand LIKE ? ESCAPE '!' THEN 4
        WHEN p.name LIKE ? ESCAPE '!' THEN 5
        WHEN p.brand LIKE ? ESCAPE '!' THEN 6
        ELSE 7
      END,
      p.id ASC
    `;

    // ORDER BY의 플레이스홀더는 WHERE와 필터 조건 뒤에 나타나므로 마지막에 추가한다.
    // 실제 추가는 categoryId·brand 조건을 모두 구성한 뒤 수행한다.
    relevanceParams.push(
      normalizedKeyword,
      normalizedKeyword,
      startsWithPattern,
      startsWithPattern,
      containsPattern,
      containsPattern
    );
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

  if (keyword !== null) {
    params.push(...relevanceParams);
  }

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
    ${orderByClause}
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
