const pool = require('../pool');

const createWishlist = async (userId, productId) => {
  const [result] = await pool.query(
    'INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)',
    [userId, productId]
  );

  // DB에서 생성한 시각까지 정확히 반환하기 위해 등록된 행을 다시 조회한다.
  const [rows] = await pool.query(
    'SELECT id, user_id, product_id, created_at FROM wishlists WHERE id = ?',
    [result.insertId]
  );

  return rows[0];
};

const deleteWishlist = async (userId, productId) => {
  // 사용자와 상품 ID를 함께 조건으로 사용해 다른 사용자의 찜은 삭제하지 않는다.
  const [result] = await pool.query(
    'DELETE FROM wishlists WHERE user_id = ? AND product_id = ?',
    [userId, productId]
  );

  return result.affectedRows;
};

const getWishlistsByUserId = async (userId) => {
  // 찜 화면에 필요한 상품·카테고리 정보를 함께 조회하고 최신 등록순으로 정렬한다.
  const query = `
    SELECT
      w.id AS wishlist_id,
      w.created_at AS created_at,
      p.id AS product_id,
      p.name AS product_name,
      p.brand AS product_brand,
      p.price AS product_price,
      p.thumbnail_url AS thumbnail_url,
      p.category_id AS category_id,
      c.name AS category_name
    FROM wishlists w
    JOIN products p ON w.product_id = p.id
    JOIN categories c ON p.category_id = c.id
    WHERE w.user_id = ?
    ORDER BY w.created_at DESC
  `;

  const [rows] = await pool.query(query, [userId]);
  return rows;
};

module.exports = {
  createWishlist,
  deleteWishlist,
  getWishlistsByUserId
};
