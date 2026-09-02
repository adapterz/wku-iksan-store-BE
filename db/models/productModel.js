const pool = require('../pool');

// LIKE에서 의미가 있는 문자도 사용자가 입력한 일반 문자 그대로 검색한다.
const escapeLikePattern = (keyword) => keyword.replace(/[!%_]/g, character => `!${character}`);

const RELEVANCE_CASE_SQL = `CASE
    WHEN p.name = ? THEN 1
    WHEN p.brand = ? THEN 2
    WHEN p.name LIKE ? ESCAPE '!' THEN 3
    WHEN p.brand LIKE ? ESCAPE '!' THEN 4
    WHEN p.name LIKE ? ESCAPE '!' THEN 5
    WHEN p.brand LIKE ? ESCAPE '!' THEN 6
    ELSE 7
  END`;

const createRelevanceParams = (keyword) => {
  const escapedKeyword = escapeLikePattern(keyword);
  const startsWithPattern = `${escapedKeyword}%`;
  const containsPattern = `%${escapedKeyword}%`;

  return [
    keyword,
    keyword,
    startsWithPattern,
    startsWithPattern,
    containsPattern,
    containsPattern
  ];
};

const getAllProducts = async ({ keyword = null, categoryId = null, brand = null } = {}) => {
  const conditions = [];
  const params = [];
  const relevanceParams = [];
  let orderByClause = '';

  if (keyword !== null) {
    if (typeof keyword !== 'string') {
      throw new TypeError('keyword must be a non-empty string');
    }

    // 공백으로 나눈 모든 단어가 상품명 또는 브랜드명 중 하나에 포함되어야 한다.
    const searchTerms = keyword.split(/\s+/).filter(Boolean);

    // API 검증을 거치지 않은 호출에서도 빈 검색어가 전체 상품 조회로 바뀌지 않게 한다.
    if (searchTerms.length === 0) {
      throw new TypeError('keyword must be a non-empty string');
    }

    searchTerms.forEach(term => {
      const likePattern = `%${escapeLikePattern(term)}%`;
      conditions.push("(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!')");
      params.push(likePattern, likePattern);
    });

    // 전체 문구 일치를 먼저 비교하고, 다중 단어는 단어별 점수 합계로 추가 정렬한다.
    const normalizedKeyword = searchTerms.join(' ');
    const termRelevanceClauses = searchTerms.map(() => RELEVANCE_CASE_SQL);
    const termScoreOrder = searchTerms.length > 1
      ? `, (${termRelevanceClauses.join(' + ')}) ASC`
      : '';

    orderByClause = `
      ORDER BY ${RELEVANCE_CASE_SQL} ASC
      ${termScoreOrder},
      p.id ASC
    `;

    // ORDER BY의 플레이스홀더는 WHERE와 필터 조건 뒤에 나타나므로 마지막에 추가한다.
    // 실제 추가는 categoryId·brand 조건을 모두 구성한 뒤 수행한다.
    relevanceParams.push(...createRelevanceParams(normalizedKeyword));

    if (searchTerms.length > 1) {
      searchTerms.forEach(term => {
        relevanceParams.push(...createRelevanceParams(term));
      });
    }
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
      p.valid_period,
      p.usage_method,
      p.exchange_location,
      p.caution,
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
