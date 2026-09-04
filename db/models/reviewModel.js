const pool = require('../pool');

const SORT_SQL = {
  latest: 'r.created_at DESC, r.id DESC',
  rating_desc: 'r.rating DESC, r.created_at DESC, r.id DESC',
  rating_asc: 'r.rating ASC, r.created_at DESC, r.id DESC'
};
const REVIEW_SELECT = `
  SELECT r.id, r.product_id, r.gift_id, r.user_id,
         r.reviewer_nickname_snapshot, r.rating, r.content, r.status,
         r.created_at, r.updated_at,
         p.name AS product_name, p.brand, p.thumbnail_url
  FROM reviews r JOIN products p ON p.id = r.product_id`;

function reject(code) {
  const error = new Error(code);
  error.reviewError = code;
  throw error;
}

async function transaction(work) {
  const connection = await pool.getConnection();
  let started = false;
  try {
    await connection.beginTransaction();
    started = true;
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    if (started) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error('Review rollback failed:', { code: rollbackError.code });
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function findReview(connection, id) {
  const [rows] = await connection.query(REVIEW_SELECT + ' WHERE r.id = ?', [id]);
  return rows[0] || null;
}

async function createReview(userId, { giftId, rating, content }) {
  return transaction(async connection => {
    // 탈퇴·닉네임 변경과 작성이 겹쳐도 작성 당시 회원정보를 안정적으로 저장한다.
    const [users] = await connection.query('SELECT nickname FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (!users.length) reject('UNAUTHORIZED');
    const [gifts] = await connection.query(`
      SELECT g.id, g.status, o.product_id, o.receiver_id, o.payment_status
      FROM gifts g JOIN orders o ON o.id = g.order_id
      WHERE g.id = ? FOR UPDATE`, [giftId]);
    if (!gifts.length) reject('GIFT_NOT_FOUND');
    const gift = gifts[0];
    if (gift.receiver_id !== userId || gift.status !== 'used' || gift.payment_status !== 'paid') {
      reject('GIFT_NOT_REVIEWABLE');
    }
    // hidden도 포함한다. 최종 중복 방어는 uq_reviews_gift가 수행한다.
    const [existing] = await connection.query('SELECT id FROM reviews WHERE gift_id = ?', [giftId]);
    if (existing.length) reject('REVIEW_ALREADY_EXISTS');
    const [result] = await connection.query(`
      INSERT INTO reviews (product_id, gift_id, user_id, reviewer_nickname_snapshot, rating, content)
      VALUES (?, ?, ?, ?, ?, ?)`, [gift.product_id, giftId, userId, users[0].nickname, rating, content]);
    return findReview(connection, result.insertId);
  });
}

async function getProductReviews(productId, { page, limit, sort }) {
  // 정렬 SQL은 고정 화이트리스트에서만 선택한다. 사용자 문자열은 결합하지 않는다.
  if (!Object.prototype.hasOwnProperty.call(SORT_SQL, sort)) throw new TypeError('Invalid review sort');
  return transaction(async connection => {
    const [totals] = await connection.query(`
      SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0) AS average_rating
      FROM reviews WHERE product_id = ? AND status = 'visible'`, [productId]);
    const [rows] = await connection.query(REVIEW_SELECT + `
      WHERE r.product_id = ? AND r.status = 'visible'
      ORDER BY ${SORT_SQL[sort]} LIMIT ? OFFSET ?`, [productId, limit, (page - 1) * limit]);
    return { rows, reviewCount: Number(totals[0].review_count), averageRating: Number(totals[0].average_rating) };
  });
}

async function getMyReviews(userId, { page, limit, productId }) {
  return transaction(async connection => {
    const params = [userId];
    let where = ' WHERE r.user_id = ?';
    if (productId !== null) {
      where += ' AND r.product_id = ?';
      params.push(productId);
    }
    const [totals] = await connection.query('SELECT COUNT(*) AS total FROM reviews r' + where, params);
    const [rows] = await connection.query(REVIEW_SELECT + where +
      ' ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?', [...params, limit, (page - 1) * limit]);
    return { rows, totalCount: Number(totals[0].total) };
  });
}

async function getReviewById(id) {
  return findReview(pool, id);
}

async function mutateOwnedReview(id, userId, changes) {
  return transaction(async connection => {
    const [rows] = await connection.query('SELECT user_id FROM reviews WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) reject('REVIEW_NOT_FOUND');
    if (rows[0].user_id !== userId) reject('FORBIDDEN_NOT_REVIEW_OWNER');
    if (changes === null) {
      await connection.query('DELETE FROM reviews WHERE id = ? AND user_id = ?', [id, userId]);
      return { reviewId: id };
    }
    const fields = [];
    const params = [];
    for (const key of ['rating', 'content']) {
      if (Object.prototype.hasOwnProperty.call(changes, key)) {
        fields.push(`${key} = ?`);
        params.push(changes[key]);
      }
    }
    if (!fields.length) reject('INVALID_REVIEW_BODY');
    await connection.query(`UPDATE reviews SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, [...params, id, userId]);
    return findReview(connection, id);
  });
}

module.exports = {
  createReview, getProductReviews, getMyReviews, getReviewById,
  updateReview: (id, userId, changes) => mutateOwnedReview(id, userId, changes),
  deleteReview: (id, userId) => mutateOwnedReview(id, userId, null)
};
