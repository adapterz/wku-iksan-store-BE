const { parsePositiveInteger } = require('./commonValidator');

const MAX_REASON_LENGTH = 500;
const TYPES = ['warning', 'suspension'];

function validateSanctionReason(value) {
  if (value === undefined || value === null || value === '') {
    return { errorCode: 'REQUIRED_SANCTION_REASON' };
  }
  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_SANCTION_REASON' };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { errorCode: 'REQUIRED_SANCTION_REASON' };
  }
  // MySQL utf8mb4 VARCHAR와 동일하게 유니코드 코드포인트 단위로 센다.
  if ([...trimmed].length > MAX_REASON_LENGTH) {
    return { errorCode: 'SANCTION_REASON_TOO_LONG' };
  }
  return { value: trimmed };
}

// POST /api/admin/users/:id/sanctions 본문 검증.
// warning은 ends_at을 받지 않고(아무 기능도 제한하지 않으니 종료 시각이 필요 없다),
// suspension은 미래 시각의 endsAt이 필수다.
function validateSanctionCreateInput(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errorCode: 'INVALID_SANCTION_BODY' };
  }
  if (Object.keys(body).some(key => !['type', 'reason', 'endsAt'].includes(key))) {
    return { errorCode: 'INVALID_SANCTION_BODY' };
  }

  if (!Object.prototype.hasOwnProperty.call(body, 'type')) {
    return { errorCode: 'REQUIRED_SANCTION_TYPE' };
  }
  if (typeof body.type !== 'string' || !TYPES.includes(body.type)) {
    return { errorCode: 'INVALID_SANCTION_TYPE' };
  }

  const reasonValidation = validateSanctionReason(body.reason);
  if (reasonValidation.errorCode) return reasonValidation;

  if (body.type === 'suspension') {
    if (body.endsAt === undefined || body.endsAt === null || body.endsAt === '') {
      return { errorCode: 'REQUIRED_ENDS_AT' };
    }
    if (typeof body.endsAt !== 'string' && typeof body.endsAt !== 'number') {
      return { errorCode: 'INVALID_ENDS_AT' };
    }
    const endsAt = new Date(body.endsAt);
    if (Number.isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
      return { errorCode: 'INVALID_ENDS_AT' };
    }
    return { value: { type: body.type, reason: reasonValidation.value, endsAt } };
  }

  if (body.endsAt !== undefined && body.endsAt !== null) {
    return { errorCode: 'INVALID_SANCTION_BODY' };
  }

  return { value: { type: body.type, reason: reasonValidation.value, endsAt: null } };
}

function validateSanctionListQuery(query = {}) {
  const page = query.page === undefined ? 1 : parsePositiveInteger(query.page, { allowString: true });
  const limit = query.limit === undefined ? 10 : parsePositiveInteger(query.limit, { allowString: true });
  if (page === null) return { errorCode: 'INVALID_PAGE' };
  if (limit === null || limit > 50) return { errorCode: 'INVALID_LIMIT' };
  if (!Number.isSafeInteger((page - 1) * limit)) return { errorCode: 'INVALID_PAGE' };
  return { value: { page, limit } };
}

module.exports = { validateSanctionReason, validateSanctionCreateInput, validateSanctionListQuery };
