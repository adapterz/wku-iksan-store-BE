const reviewModel = require('../db/models/reviewModel');
const reportModel = require('../db/models/reportModel');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateReportReason } = require('../validators/reportValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

function mapReport(row) {
  return {
    reportId: row.id,
    reviewId: row.review_id,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at
  };
}

// POST /api/reviews/:id/reports — 신고 접수 시점의 리뷰 내용/별점을 스냅샷으로 저장한다.
async function createReport(req, res) {
  const reviewId = parsePositiveInteger(req.params.id, { allowString: true });
  if (reviewId === null) return sendError(res, ERROR.INVALID_REVIEW_ID);

  const reasonValidation = validateReportReason((req.body || {}).reason);
  if (reasonValidation.errorCode) return sendError(res, ERROR[reasonValidation.errorCode]);

  try {
    const review = await reviewModel.getReviewById(reviewId);
    if (!review) return sendError(res, ERROR.REVIEW_NOT_FOUND);

    // FE의 버튼 노출 여부나 요청 본문이 아니라 DB 작성자와 인증된 세션을 비교한다.
    // BIGINT ID가 문자열로 반환되더라도 같은 계정은 차단한다. 탈퇴한 작성자는 null이다.
    if (review.user_id != null && String(review.user_id) === String(req.session.userId)) {
      return sendError(res, ERROR.CANNOT_REPORT_OWN_REVIEW);
    }

    const report = await reportModel.createReport(req.session.userId, {
      reviewId,
      authorId: review.user_id,
      reviewContentSnapshot: review.content,
      reviewRatingSnapshot: review.rating,
      reason: reasonValidation.value
    });

    return sendSuccess(res, { ...SUCCESS.REPORT_CREATE_SUCCESS, data: mapReport(report) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return sendError(res, ERROR.REPORT_ALREADY_EXISTS);
    console.error('Error in POST /api/reviews/:id/reports:', error);
    return sendError(res);
  }
}

module.exports = { createReport };
