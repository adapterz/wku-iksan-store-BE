const reviewModel = require('../db/models/reviewModel');
const productModel = require('../db/models/productModel');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateReviewBody, validateReviewQuery } = require('../validators/reviewValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

function mapReview(row, userId, { mine = false } = {}) {
  const result = {
    reviewId: row.id,
    nickname: row.reviewer_nickname_snapshot,
    rating: row.rating,
    content: row.content,
    isMine: userId != null && row.user_id != null && row.user_id === userId,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  // 공개 목록에는 회원 ID·탈퇴 여부·선물 ID를 노출하지 않는다.
  if (mine) {
    result.giftId = row.gift_id;
    result.status = row.status;
    result.product = { id: row.product_id, name: row.product_name, brand: row.brand, thumbnailUrl: row.thumbnail_url };
  }
  return result;
}

function meta({ page, limit }, totalCount) {
  return { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) };
}

function failure(res, error) {
  if (error.reviewError && ERROR[error.reviewError]) return sendError(res, ERROR[error.reviewError]);
  if (error.code === 'ER_DUP_ENTRY') return sendError(res, ERROR.REVIEW_ALREADY_EXISTS);
  // DB 오류 객체에는 리뷰 본문을 포함한 SQL이 들어갈 수 있어 전체 객체는 기록하지 않는다.
  console.error('Review operation failed:', { code: error.code || 'UNKNOWN' });
  return sendError(res);
}

async function getProductReviews(req, res) {
  const productId = parsePositiveInteger(req.params.id, { allowString: true });
  if (productId === null) return sendError(res, ERROR.INVALID_PRODUCT_ID);
  const query = validateReviewQuery(req.query);
  if (query.errorCode) return sendError(res, ERROR[query.errorCode]);
  try {
    if (!await productModel.getProductById(productId)) return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    const result = await reviewModel.getProductReviews(productId, query.value);
    return sendSuccess(res, {
      ...SUCCESS.REVIEW_LIST_SUCCESS,
      data: {
        summary: { averageRating: Math.round(result.averageRating * 10) / 10, reviewCount: result.reviewCount },
        reviews: result.rows.map(row => mapReview(row, req.session?.userId))
      },
      meta: meta(query.value, result.reviewCount)
    });
  } catch (error) { return failure(res, error); }
}

async function createReview(req, res) {
  const body = validateReviewBody(req.body);
  if (body.errorCode) return sendError(res, ERROR[body.errorCode]);
  try {
    const row = await reviewModel.createReview(req.session.userId, body.value);
    return sendSuccess(res, { ...SUCCESS.REVIEW_CREATE_SUCCESS, data: mapReview(row, req.session.userId, { mine: true }) });
  } catch (error) { return failure(res, error); }
}

async function getMyReviews(req, res) {
  const query = validateReviewQuery(req.query, { mine: true });
  if (query.errorCode) return sendError(res, ERROR[query.errorCode]);
  try {
    const result = await reviewModel.getMyReviews(req.session.userId, query.value);
    return sendSuccess(res, {
      ...SUCCESS.MY_REVIEW_LIST_SUCCESS,
      data: result.rows.map(row => mapReview(row, req.session.userId, { mine: true })),
      meta: meta(query.value, result.totalCount)
    });
  } catch (error) { return failure(res, error); }
}

async function getReviewDetail(req, res) {
  const id = parsePositiveInteger(req.params.id, { allowString: true });
  if (id === null) return sendError(res, ERROR.INVALID_REVIEW_ID);
  try {
    const row = await reviewModel.getReviewById(id);
    if (!row) return sendError(res, ERROR.REVIEW_NOT_FOUND);
    if (row.user_id !== req.session.userId) return sendError(res, ERROR.FORBIDDEN_NOT_REVIEW_OWNER);
    return sendSuccess(res, { ...SUCCESS.REVIEW_DETAIL_SUCCESS, data: mapReview(row, req.session.userId, { mine: true }) });
  } catch (error) { return failure(res, error); }
}

async function updateReview(req, res) {
  const id = parsePositiveInteger(req.params.id, { allowString: true });
  if (id === null) return sendError(res, ERROR.INVALID_REVIEW_ID);
  const body = validateReviewBody(req.body, { partial: true });
  if (body.errorCode) return sendError(res, ERROR[body.errorCode]);
  try {
    const row = await reviewModel.updateReview(id, req.session.userId, body.value);
    return sendSuccess(res, { ...SUCCESS.REVIEW_UPDATE_SUCCESS, data: mapReview(row, req.session.userId, { mine: true }) });
  } catch (error) { return failure(res, error); }
}

async function deleteReview(req, res) {
  const id = parsePositiveInteger(req.params.id, { allowString: true });
  if (id === null) return sendError(res, ERROR.INVALID_REVIEW_ID);
  try {
    const result = await reviewModel.deleteReview(id, req.session.userId);
    return sendSuccess(res, { ...SUCCESS.REVIEW_DELETE_SUCCESS, data: result });
  } catch (error) { return failure(res, error); }
}

module.exports = { getProductReviews, createReview, getMyReviews, getReviewDetail, updateReview, deleteReview };
