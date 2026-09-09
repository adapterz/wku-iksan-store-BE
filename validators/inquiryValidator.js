const { parsePositiveInteger } = require('./commonValidator');

const MAX_CONTENT_LENGTH = 1000;
const MAX_ADMIN_REPLY_LENGTH = 1000;
const CATEGORIES = ['general', 'sanction_appeal'];
const LIST_STATUSES = ['pending', 'answered'];

function validateInquiryContent(value) {
  if (value === undefined || value === null || value === '') {
    return { errorCode: 'REQUIRED_INQUIRY_CONTENT' };
  }
  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_INQUIRY_CONTENT' };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { errorCode: 'REQUIRED_INQUIRY_CONTENT' };
  }
  // MySQL utf8mb4 VARCHAR와 동일하게 유니코드 코드포인트 단위로 센다.
  if ([...trimmed].length > MAX_CONTENT_LENGTH) {
    return { errorCode: 'INQUIRY_CONTENT_TOO_LONG' };
  }
  return { value: trimmed };
}

// POST /api/inquiries 본문 검증. category를 생략하면 general로 취급한다.
function validateInquiryCreateInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['category', 'content'].includes(key))) {
    return { errorCode: 'INVALID_INQUIRY_BODY' };
  }

  let category = 'general';
  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== 'string' || !CATEGORIES.includes(body.category)) {
      return { errorCode: 'INVALID_INQUIRY_CATEGORY' };
    }
    category = body.category;
  }

  const contentValidation = validateInquiryContent(body.content);
  if (contentValidation.errorCode) return contentValidation;

  return { value: { category, content: contentValidation.value } };
}

// mine이면 GET /api/inquiries/me용(상태 필터 없음), 아니면 관리자 큐용(상태 필터 허용).
function validateInquiryListQuery(query = {}, { mine = false } = {}) {
  const page = query.page === undefined ? 1 : parsePositiveInteger(query.page, { allowString: true });
  const limit = query.limit === undefined ? 10 : parsePositiveInteger(query.limit, { allowString: true });
  if (page === null) return { errorCode: 'INVALID_PAGE' };
  if (limit === null || limit > 50) return { errorCode: 'INVALID_LIMIT' };
  if (!Number.isSafeInteger((page - 1) * limit)) return { errorCode: 'INVALID_PAGE' };

  let status = null;
  if (!mine && query.status !== undefined) {
    if (!LIST_STATUSES.includes(query.status)) {
      return { errorCode: 'INVALID_INQUIRY_STATUS' };
    }
    status = query.status;
  }

  return { value: { page, limit, status } };
}

// PATCH /api/admin/inquiries/:id 본문 검증 — 답변 등록 시 상태는 자동으로 answered가 된다.
// sanctionId는 sanction_appeal 문의를 승인해 정지도 함께 해제할 때만 보낸다(이슈 #90
// 8-1절). 이 문의가 실제로 sanction_appeal인지, sanctionId가 이 문의의 유저 것인지는
// 컨트롤러에서 문의/제재 행을 조회한 뒤에만 알 수 있어 여기서는 형식만 검증한다.
function validateInquiryReplyInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['adminReply', 'sanctionId'].includes(key))) {
    return { errorCode: 'INVALID_INQUIRY_BODY' };
  }
  if (!Object.prototype.hasOwnProperty.call(body, 'adminReply')) {
    return { errorCode: 'REQUIRED_ADMIN_REPLY' };
  }
  if (typeof body.adminReply !== 'string') {
    return { errorCode: 'INVALID_ADMIN_REPLY' };
  }
  const trimmed = body.adminReply.trim();
  if (!trimmed) {
    return { errorCode: 'REQUIRED_ADMIN_REPLY' };
  }
  if ([...trimmed].length > MAX_ADMIN_REPLY_LENGTH) {
    return { errorCode: 'ADMIN_REPLY_TOO_LONG' };
  }

  let sanctionId = null;
  if (body.sanctionId !== undefined && body.sanctionId !== null) {
    sanctionId = parsePositiveInteger(body.sanctionId);
    if (sanctionId === null) return { errorCode: 'INVALID_SANCTION_ID' };
  }

  return { value: { adminReply: trimmed, sanctionId } };
}

module.exports = {
  validateInquiryContent,
  validateInquiryCreateInput,
  validateInquiryListQuery,
  validateInquiryReplyInput
};
