const { parsePositiveInteger } = require('./commonValidator');

const MAX_REASON_LENGTH = 500;
const LIST_STATUSES = ['pending', 'dismissed', 'actioned'];
// 관리자가 신고를 처리할 때 지정할 수 있는 상태만 허용한다. pending은 생성 시 기본값이라
// 다시 되돌리는 용도로 쓰지 않는다.
const UPDATE_STATUSES = ['dismissed', 'actioned'];

function validateReportReason(value) {
  if (value === undefined || value === null || value === '') {
    return { errorCode: 'REQUIRED_REPORT_REASON' };
  }
  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_REPORT_REASON' };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { errorCode: 'REQUIRED_REPORT_REASON' };
  }
  // MySQL utf8mb4 VARCHAR와 동일하게 유니코드 코드포인트 단위로 센다.
  if ([...trimmed].length > MAX_REASON_LENGTH) {
    return { errorCode: 'REPORT_REASON_TOO_LONG' };
  }
  return { value: trimmed };
}

function validateReportListQuery(query = {}) {
  const page = query.page === undefined ? 1 : parsePositiveInteger(query.page, { allowString: true });
  const limit = query.limit === undefined ? 10 : parsePositiveInteger(query.limit, { allowString: true });
  if (page === null) return { errorCode: 'INVALID_PAGE' };
  if (limit === null || limit > 50) return { errorCode: 'INVALID_LIMIT' };
  if (!Number.isSafeInteger((page - 1) * limit)) return { errorCode: 'INVALID_PAGE' };

  let status = null;
  if (query.status !== undefined) {
    if (!LIST_STATUSES.includes(query.status)) {
      return { errorCode: 'INVALID_REPORT_STATUS' };
    }
    status = query.status;
  }

  return { value: { page, limit, status } };
}

function validateReportStatusBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => key !== 'status')) {
    return { errorCode: 'INVALID_REPORT_BODY' };
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'status')) {
    return { errorCode: 'REQUIRED_REPORT_STATUS' };
  }
  if (typeof body.status !== 'string' || !UPDATE_STATUSES.includes(body.status)) {
    return { errorCode: 'INVALID_REPORT_STATUS' };
  }
  return { value: { status: body.status } };
}

module.exports = { validateReportReason, validateReportListQuery, validateReportStatusBody };
