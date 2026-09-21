const {
  validateInquiryContent,
  validateInquiryCreateInput,
  validateInquiryListQuery,
  validateInquiryReplyInput
} = require('../../../validators/inquiryValidator');

describe('validateInquiryContent', () => {
  test('공백/누락은 REQUIRED_INQUIRY_CONTENT', () => {
    expect(validateInquiryContent(undefined).errorCode).toBe('REQUIRED_INQUIRY_CONTENT');
    expect(validateInquiryContent('   ').errorCode).toBe('REQUIRED_INQUIRY_CONTENT');
  });

  test('문자열이 아니면 INVALID_INQUIRY_CONTENT', () => {
    expect(validateInquiryContent(123).errorCode).toBe('INVALID_INQUIRY_CONTENT');
  });

  test('1000자 초과는 INQUIRY_CONTENT_TOO_LONG', () => {
    expect(validateInquiryContent('가'.repeat(1001)).errorCode).toBe('INQUIRY_CONTENT_TOO_LONG');
  });

  test('앞뒤 공백을 제거한 값을 반환', () => {
    expect(validateInquiryContent('  배송이 안 와요  ')).toEqual({ value: '배송이 안 와요' });
  });
});

describe('validateInquiryCreateInput', () => {
  test('category 생략 시 general로 취급', () => {
    expect(validateInquiryCreateInput({ content: '문의합니다' })).toEqual({
      value: { category: 'general', content: '문의합니다' }
    });
  });

  test('sanction_appeal 지정 가능', () => {
    expect(validateInquiryCreateInput({ category: 'sanction_appeal', content: '이의제기합니다' })).toEqual({
      value: { category: 'sanction_appeal', content: '이의제기합니다' }
    });
  });

  test('허용되지 않은 category는 INVALID_INQUIRY_CATEGORY', () => {
    expect(validateInquiryCreateInput({ category: 'etc', content: '문의' }).errorCode).toBe('INVALID_INQUIRY_CATEGORY');
  });

  test('content 누락은 REQUIRED_INQUIRY_CONTENT', () => {
    expect(validateInquiryCreateInput({}).errorCode).toBe('REQUIRED_INQUIRY_CONTENT');
  });

  test('추가 필드 주입 거부', () => {
    expect(validateInquiryCreateInput({ content: '문의', status: 'answered' }).errorCode).toBe('INVALID_INQUIRY_BODY');
  });

  test.each([null, [], 'x', 1])('잘못된 body %p 거부', body => {
    expect(validateInquiryCreateInput(body).errorCode).toBe('INVALID_INQUIRY_BODY');
  });
});

describe('validateInquiryListQuery', () => {
  test('기본값은 page 1, limit 10, status 없음', () => {
    expect(validateInquiryListQuery({})).toEqual({ value: { page: 1, limit: 10, status: null } });
  });

  test('page/limit 검증은 다른 목록 API와 동일한 규칙', () => {
    expect(validateInquiryListQuery({ page: '0' }).errorCode).toBe('INVALID_PAGE');
    expect(validateInquiryListQuery({ limit: '100' }).errorCode).toBe('INVALID_LIMIT');
  });

  test('mine=false(관리자 큐)에서 status 필터 지정 시 반영', () => {
    expect(validateInquiryListQuery({ status: 'pending', page: '2', limit: '20' })).toEqual({
      value: { page: 2, limit: 20, status: 'pending' }
    });
  });

  test('mine=false에서 허용되지 않은 status는 INVALID_INQUIRY_STATUS', () => {
    expect(validateInquiryListQuery({ status: 'unknown' }).errorCode).toBe('INVALID_INQUIRY_STATUS');
  });

  test('mine=true(내 문의 목록)에서는 status 파라미터를 무시', () => {
    expect(validateInquiryListQuery({ status: 'unknown' }, { mine: true })).toEqual({
      value: { page: 1, limit: 10, status: null }
    });
  });
});

describe('validateInquiryReplyInput', () => {
  test('adminReply 누락은 REQUIRED_ADMIN_REPLY', () => {
    expect(validateInquiryReplyInput({}).errorCode).toBe('REQUIRED_ADMIN_REPLY');
  });

  test('공백만 있으면 REQUIRED_ADMIN_REPLY', () => {
    expect(validateInquiryReplyInput({ adminReply: '   ' }).errorCode).toBe('REQUIRED_ADMIN_REPLY');
  });

  test('문자열이 아니면 INVALID_ADMIN_REPLY', () => {
    expect(validateInquiryReplyInput({ adminReply: 123 }).errorCode).toBe('INVALID_ADMIN_REPLY');
  });

  test('1000자 초과는 ADMIN_REPLY_TOO_LONG', () => {
    expect(validateInquiryReplyInput({ adminReply: '가'.repeat(1001) }).errorCode).toBe('ADMIN_REPLY_TOO_LONG');
  });

  test('앞뒤 공백을 제거한 값을 반환', () => {
    expect(validateInquiryReplyInput({ adminReply: '  확인 후 조치했습니다  ' })).toEqual({
      value: { adminReply: '확인 후 조치했습니다', sanctionId: null }
    });
  });

  test('추가 필드 주입 거부', () => {
    expect(validateInquiryReplyInput({ adminReply: '답변', status: 'answered' }).errorCode).toBe('INVALID_INQUIRY_BODY');
  });

  test.each([null, [], 'x', 1])('잘못된 body %p 거부', body => {
    expect(validateInquiryReplyInput(body).errorCode).toBe('INVALID_INQUIRY_BODY');
  });

  test('sanctionId 생략 시 null로 취급', () => {
    expect(validateInquiryReplyInput({ adminReply: '답변' })).toEqual({
      value: { adminReply: '답변', sanctionId: null }
    });
  });

  test('sanctionId를 함께 보내면 정수로 반환', () => {
    expect(validateInquiryReplyInput({ adminReply: '정지를 해제합니다', sanctionId: 42 })).toEqual({
      value: { adminReply: '정지를 해제합니다', sanctionId: 42 }
    });
  });

  test.each(['42', -1, 0, 1.5])('sanctionId가 양의 정수가 아니면 INVALID_SANCTION_ID (%p)', sanctionId => {
    expect(validateInquiryReplyInput({ adminReply: '답변', sanctionId }).errorCode).toBe('INVALID_SANCTION_ID');
  });
});
