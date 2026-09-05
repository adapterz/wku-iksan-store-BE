const { validateReviewBody, validateReviewQuery } = require('../../../validators/reviewValidator');
const valid = { giftId: 1, rating: 5, content: ' 좋아요 ' };

describe('reviewValidator', () => {
  test('새 리뷰는 trim하며 서버 결정 필드를 만들지 않는다', () => {
    expect(validateReviewBody(valid)).toEqual({ value: { giftId: 1, rating: 5, content: '좋아요' } });
  });
  test.each([null, [], 'text', 5])('잘못된 body %p 거부', body => {
    expect(validateReviewBody(body).errorCode).toBe('INVALID_REVIEW_BODY');
  });
  test.each([0, -1, 1.5, '1', null, true, {}, 9007199254740992])('giftId %p 거부', giftId => {
    expect(validateReviewBody({ ...valid, giftId }).errorCode).toBe('INVALID_GIFT_ID');
  });
  test.each([0, 6, -1, 1.5, '5', null, true])('rating %p 거부', rating => {
    expect(validateReviewBody({ ...valid, rating }).errorCode).toBe('INVALID_RATING');
  });
  test.each([null, 1, {}, []])('content %p 거부', content => {
    expect(validateReviewBody({ ...valid, content }).errorCode).toBe('INVALID_REVIEW_CONTENT');
  });
  test.each(['', '  ', '\n\t'])('빈 리뷰 %p 거부', content => {
    expect(validateReviewBody({ ...valid, content }).errorCode).toBe('REQUIRED_REVIEW_CONTENT');
  });
  test.each(['productId', 'userId', 'gift_id', 'status', 'nickname'])('서버 결정 필드 %s 거부', key => {
    expect(validateReviewBody({ ...valid, [key]: 1 }).errorCode).toBe('INVALID_REVIEW_BODY');
  });
  test('필수 입력 누락', () => {
    expect(validateReviewBody({}).errorCode).toBe('REQUIRED_GIFT_ID');
    expect(validateReviewBody({ giftId: 1 }).errorCode).toBe('REQUIRED_RATING');
    expect(validateReviewBody({ giftId: 1, rating: 1 }).errorCode).toBe('REQUIRED_REVIEW_CONTENT');
  });
  test('유니코드 1000자는 허용하고 1001자는 거부', () => {
    expect(validateReviewBody({ ...valid, content: '😀'.repeat(1000) }).value.content).toHaveLength(2000);
    expect(validateReviewBody({ ...valid, content: '😀'.repeat(1001) }).errorCode).toBe('REVIEW_CONTENT_TOO_LONG');
  });
  test('부분 수정과 빈 수정', () => {
    expect(validateReviewBody({ rating: 3 }, { partial: true })).toEqual({ value: { rating: 3 } });
    expect(validateReviewBody({ content: ' 수정 ' }, { partial: true })).toEqual({ value: { content: '수정' } });
    expect(validateReviewBody({}, { partial: true }).errorCode).toBe('INVALID_REVIEW_BODY');
    expect(validateReviewBody(valid, { partial: true }).errorCode).toBe('INVALID_REVIEW_BODY');
  });
  test('쿼리 기본값', () => {
    expect(validateReviewQuery().value).toEqual({ page: 1, limit: 10, sort: 'latest', productId: null });
  });
  test.each(['0', '-1', '1.2', '', '01', ['1', '2'], {}, '9007199254740992'])('page %p 거부', page => {
    expect(validateReviewQuery({ page }).errorCode).toBe('INVALID_PAGE');
  });
  test.each(['0', '51', '1.5', [], 'abc'])('limit %p 거부', limit => {
    expect(validateReviewQuery({ limit }).errorCode).toBe('INVALID_LIMIT');
  });
  test('offset 정수 범위 초과 거부', () => {
    expect(validateReviewQuery({ page: '9007199254740991', limit: '50' }).errorCode).toBe('INVALID_PAGE');
  });
  test.each(['latest', 'rating_desc', 'rating_asc'])('허용 정렬 %s', sort => {
    expect(validateReviewQuery({ sort }).value.sort).toBe(sort);
  });
  test('정렬 SQL 주입과 내 목록 임의 정렬 거부', () => {
    expect(validateReviewQuery({ sort: 'rating; DROP TABLE reviews' }).errorCode).toBe('INVALID_REVIEW_SORT');
    expect(validateReviewQuery({ sort: 'rating_desc' }, { mine: true }).errorCode).toBe('INVALID_REVIEW_SORT');
  });
  test('내 리뷰 상품 필터', () => {
    expect(validateReviewQuery({ productId: '3' }, { mine: true }).value.productId).toBe(3);
    expect(validateReviewQuery({ productId: 'abc' }, { mine: true }).errorCode).toBe('INVALID_PRODUCT_ID');
  });
});
