const { parsePositiveInteger } = require('./commonValidator');

const SORTS = ['latest', 'rating_desc', 'rating_asc'];
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function validateReviewBody(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errorCode: 'INVALID_REVIEW_BODY' };
  }
  const allowed = partial ? ['rating', 'content'] : ['giftId', 'rating', 'content'];
  // 관계 ID·상태·닉네임 등 서버가 결정하는 값을 클라이언트가 주입하지 못하게 한다.
  if (Object.keys(body).some(key => !allowed.includes(key))) {
    return { errorCode: 'INVALID_REVIEW_BODY' };
  }
  const value = {};
  if (!partial) {
    if (!has(body, 'giftId')) return { errorCode: 'REQUIRED_GIFT_ID' };
    value.giftId = parsePositiveInteger(body.giftId);
    if (value.giftId === null) return { errorCode: 'INVALID_GIFT_ID' };
  }
  if (!partial || has(body, 'rating')) {
    if (!has(body, 'rating')) return { errorCode: 'REQUIRED_RATING' };
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      return { errorCode: 'INVALID_RATING' };
    }
    value.rating = body.rating;
  }
  if (!partial || has(body, 'content')) {
    if (!has(body, 'content')) return { errorCode: 'REQUIRED_REVIEW_CONTENT' };
    if (typeof body.content !== 'string') return { errorCode: 'INVALID_REVIEW_CONTENT' };
    value.content = body.content.trim();
    if (!value.content) return { errorCode: 'REQUIRED_REVIEW_CONTENT' };
    // MySQL utf8mb4 VARCHAR와 동일하게 유니코드 코드포인트 단위로 센다.
    if ([...value.content].length > 1000) return { errorCode: 'REVIEW_CONTENT_TOO_LONG' };
  }
  if (partial && Object.keys(value).length === 0) return { errorCode: 'INVALID_REVIEW_BODY' };
  return { value };
}

function validateReviewQuery(query = {}, { mine = false } = {}) {
  const page = query.page === undefined ? 1 : parsePositiveInteger(query.page, { allowString: true });
  const limit = query.limit === undefined ? 10 : parsePositiveInteger(query.limit, { allowString: true });
  if (page === null) return { errorCode: 'INVALID_PAGE' };
  if (limit === null || limit > 50) return { errorCode: 'INVALID_LIMIT' };
  if (!Number.isSafeInteger((page - 1) * limit)) return { errorCode: 'INVALID_PAGE' };
  const sort = query.sort === undefined ? 'latest' : query.sort;
  if (!SORTS.includes(sort) || (mine && sort !== 'latest')) return { errorCode: 'INVALID_REVIEW_SORT' };
  let productId = null;
  if (mine && query.productId !== undefined) {
    productId = parsePositiveInteger(query.productId, { allowString: true });
    if (productId === null) return { errorCode: 'INVALID_PRODUCT_ID' };
  }
  return { value: { page, limit, sort, productId } };
}

module.exports = { validateReviewBody, validateReviewQuery };
