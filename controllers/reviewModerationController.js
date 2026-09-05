const reviewModel = require('../db/models/reviewModel');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateReviewStatusBody } = require('../validators/reviewStatusValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

async function updateReviewStatus(req, res) {
  const id = parsePositiveInteger(req.params.id, { allowString: true });
  if (id === null) return sendError(res, ERROR.INVALID_REVIEW_ID);
  const body = validateReviewStatusBody(req.body);
  if (body.errorCode) return sendError(res, ERROR[body.errorCode]);

  try {
    const result = await reviewModel.updateReviewStatus(id, body.value.status);
    return sendSuccess(res, { ...SUCCESS.ADMIN_REVIEW_STATUS_UPDATE_SUCCESS, data: result });
  } catch (error) {
    if (error.reviewError && ERROR[error.reviewError]) return sendError(res, ERROR[error.reviewError]);
    console.error('Review moderation failed:', { code: error.code || 'UNKNOWN' });
    return sendError(res);
  }
}

module.exports = { updateReviewStatus };
