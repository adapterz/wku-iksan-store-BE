const STATUSES = ['visible', 'hidden'];

function validateReviewStatusBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'status')) {
    return { errorCode: 'INVALID_REVIEW_BODY' };
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'status')) {
    return { errorCode: 'REQUIRED_REVIEW_STATUS' };
  }
  if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) {
    return { errorCode: 'INVALID_REVIEW_STATUS' };
  }
  return { value: { status: body.status } };
}

module.exports = { validateReviewStatusBody };
