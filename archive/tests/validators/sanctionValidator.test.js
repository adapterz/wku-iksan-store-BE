const {
  validateSanctionReason,
  validateSanctionCreateInput,
  validateSanctionListQuery
} = require('../../../validators/sanctionValidator');

describe('validateSanctionReason', () => {
  test('공백/누락은 REQUIRED_SANCTION_REASON', () => {
    expect(validateSanctionReason(undefined).errorCode).toBe('REQUIRED_SANCTION_REASON');
    expect(validateSanctionReason('   ').errorCode).toBe('REQUIRED_SANCTION_REASON');
  });

  test('문자열이 아니면 INVALID_SANCTION_REASON', () => {
    expect(validateSanctionReason(123).errorCode).toBe('INVALID_SANCTION_REASON');
  });

  test('500자 초과는 SANCTION_REASON_TOO_LONG', () => {
    expect(validateSanctionReason('가'.repeat(501)).errorCode).toBe('SANCTION_REASON_TOO_LONG');
  });

  test('앞뒤 공백 제거', () => {
    expect(validateSanctionReason('  욕설 반복  ')).toEqual({ value: '욕설 반복' });
  });
});

describe('validateSanctionCreateInput', () => {
  test('type 누락은 REQUIRED_SANCTION_TYPE', () => {
    expect(validateSanctionCreateInput({ reason: '사유' }).errorCode).toBe('REQUIRED_SANCTION_TYPE');
  });

  test('허용되지 않은 type은 INVALID_SANCTION_TYPE', () => {
    expect(validateSanctionCreateInput({ type: 'ban', reason: '사유' }).errorCode).toBe('INVALID_SANCTION_TYPE');
  });

  test('reason 누락은 REQUIRED_SANCTION_REASON', () => {
    expect(validateSanctionCreateInput({ type: 'warning' }).errorCode).toBe('REQUIRED_SANCTION_REASON');
  });

  test('경고는 endsAt 없이 정상 처리', () => {
    expect(validateSanctionCreateInput({ type: 'warning', reason: '첫 경고' })).toEqual({
      value: { type: 'warning', reason: '첫 경고', endsAt: null }
    });
  });

  test('경고에 endsAt을 같이 보내면 INVALID_SANCTION_BODY', () => {
    const result = validateSanctionCreateInput({ type: 'warning', reason: '사유', endsAt: '2099-01-01' });
    expect(result.errorCode).toBe('INVALID_SANCTION_BODY');
  });

  test('정지인데 endsAt이 없으면 REQUIRED_ENDS_AT', () => {
    expect(validateSanctionCreateInput({ type: 'suspension', reason: '사유' }).errorCode).toBe('REQUIRED_ENDS_AT');
  });

  test('정지의 endsAt이 과거/현재면 INVALID_ENDS_AT', () => {
    expect(validateSanctionCreateInput({
      type: 'suspension', reason: '사유', endsAt: '2020-01-01T00:00:00.000Z'
    }).errorCode).toBe('INVALID_ENDS_AT');
  });

  test('정지의 endsAt이 파싱 불가능한 값이면 INVALID_ENDS_AT', () => {
    expect(validateSanctionCreateInput({
      type: 'suspension', reason: '사유', endsAt: '내일쯤'
    }).errorCode).toBe('INVALID_ENDS_AT');
  });

  test('정지는 미래 endsAt을 Date로 변환해 반환', () => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
    const result = validateSanctionCreateInput({ type: 'suspension', reason: '반복 위반', endsAt: future });
    expect(result.value.type).toBe('suspension');
    expect(result.value.endsAt).toBeInstanceOf(Date);
    expect(result.value.endsAt.toISOString()).toBe(future);
  });

  test('허용되지 않은 필드가 있으면 INVALID_SANCTION_BODY', () => {
    expect(validateSanctionCreateInput({ type: 'warning', reason: '사유', userId: 1 }).errorCode)
      .toBe('INVALID_SANCTION_BODY');
  });

  test.each([null, [], 'x', 1])('잘못된 body %p 거부', body => {
    expect(validateSanctionCreateInput(body).errorCode).toBe('INVALID_SANCTION_BODY');
  });
});

describe('validateSanctionListQuery', () => {
  test('기본값은 page 1, limit 10', () => {
    expect(validateSanctionListQuery({})).toEqual({ value: { page: 1, limit: 10 } });
  });

  test('page/limit 검증은 다른 목록 API와 동일한 규칙', () => {
    expect(validateSanctionListQuery({ page: '0' }).errorCode).toBe('INVALID_PAGE');
    expect(validateSanctionListQuery({ limit: '100' }).errorCode).toBe('INVALID_LIMIT');
  });
});
