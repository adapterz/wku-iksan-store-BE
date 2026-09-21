const {
  validateReportReason,
  validateReportListQuery,
  validateReportStatusBody
} = require('../../../validators/reportValidator');

describe('validateReportReason', () => {
  test('공백/누락은 REQUIRED_REPORT_REASON', () => {
    expect(validateReportReason(undefined).errorCode).toBe('REQUIRED_REPORT_REASON');
    expect(validateReportReason('   ').errorCode).toBe('REQUIRED_REPORT_REASON');
  });

  test('문자열이 아니면 INVALID_REPORT_REASON', () => {
    expect(validateReportReason(123).errorCode).toBe('INVALID_REPORT_REASON');
  });

  test('500자 초과는 REPORT_REASON_TOO_LONG', () => {
    expect(validateReportReason('가'.repeat(501)).errorCode).toBe('REPORT_REASON_TOO_LONG');
  });

  test('앞뒤 공백을 제거한 값을 반환', () => {
    expect(validateReportReason('  스팸성 리뷰입니다  ')).toEqual({ value: '스팸성 리뷰입니다' });
  });
});

describe('validateReportListQuery', () => {
  test('기본값은 page 1, limit 10, status 없음', () => {
    expect(validateReportListQuery({})).toEqual({ value: { page: 1, limit: 10, status: null } });
  });

  test('허용되지 않은 status는 INVALID_REPORT_STATUS', () => {
    expect(validateReportListQuery({ status: 'unknown' }).errorCode).toBe('INVALID_REPORT_STATUS');
  });

  test('page/limit 검증은 리뷰 목록과 동일한 규칙', () => {
    expect(validateReportListQuery({ page: '0' }).errorCode).toBe('INVALID_PAGE');
    expect(validateReportListQuery({ limit: '100' }).errorCode).toBe('INVALID_LIMIT');
  });

  test('status 필터 지정 시 그대로 반영', () => {
    expect(validateReportListQuery({ status: 'pending', page: '2', limit: '20' })).toEqual({
      value: { page: 2, limit: 20, status: 'pending' }
    });
  });
});

describe('validateReportStatusBody', () => {
  test.each(['dismissed', 'actioned'])('허용 상태 %s', status => {
    expect(validateReportStatusBody({ status })).toEqual({ value: { status } });
  });

  test('pending으로는 되돌릴 수 없음', () => {
    expect(validateReportStatusBody({ status: 'pending' }).errorCode).toBe('INVALID_REPORT_STATUS');
  });

  test('누락과 잘못된 값을 구분', () => {
    expect(validateReportStatusBody({}).errorCode).toBe('REQUIRED_REPORT_STATUS');
    expect(validateReportStatusBody({ status: 'deleted' }).errorCode).toBe('INVALID_REPORT_STATUS');
  });

  test('추가 필드 주입 거부', () => {
    expect(validateReportStatusBody({ status: 'actioned', reviewId: 1 }).errorCode).toBe('INVALID_REPORT_BODY');
  });

  test.each([null, [], 'actioned', 1])('잘못된 body %p 거부', body => {
    expect(validateReportStatusBody(body).errorCode).toBe('INVALID_REPORT_BODY');
  });
});
