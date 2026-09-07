const { validateReviewStatusBody } = require('../../../validators/reviewStatusValidator');

describe('reviewStatusValidator', () => {
  test.each(['visible', 'hidden'])('허용 상태 %s', status => {
    expect(validateReviewStatusBody({ status })).toEqual({ value: { status } });
  });

  test.each([null, [], 'hidden', 1])('잘못된 body %p 거부', body => {
    expect(validateReviewStatusBody(body).errorCode).toBe('INVALID_REVIEW_BODY');
  });

  test('누락과 허용되지 않은 상태를 구분', () => {
    expect(validateReviewStatusBody({}).errorCode).toBe('REQUIRED_REVIEW_STATUS');
    expect(validateReviewStatusBody({ status: 'deleted' }).errorCode).toBe('INVALID_REVIEW_STATUS');
    expect(validateReviewStatusBody({ status: 1 }).errorCode).toBe('INVALID_REVIEW_STATUS');
  });

  test('추가 필드 주입 거부', () => {
    expect(validateReviewStatusBody({ status: 'hidden', userId: 1 }).errorCode).toBe('INVALID_REVIEW_BODY');
  });
});
