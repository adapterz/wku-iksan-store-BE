const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
jest.mock('../../../db/models/reviewModel');
jest.mock('../../../db/models/productModel');
const model = require('../../../db/models/reviewModel');
const products = require('../../../db/models/productModel');
const reviewsRouter = require('../../../routes/reviews');
const productsRouter = require('../../../routes/products');
const row = {
  id: 9, product_id: 3, gift_id: 7, user_id: 1,
  reviewer_nickname_snapshot: '작성당시', rating: 5, content: '후기',
  status: 'visible', created_at: '2026-09-04T00:00:00Z', updated_at: '2026-09-04T00:00:00Z',
  product_name: '상품', brand: '브랜드', thumbnail_url: null
};
const app = (userId = 1) => createTestApp('/api/reviews', reviewsRouter, { session: userId ? { userId } : {} });
const productApp = (userId = 1) => createTestApp('/api/products', productsRouter, { session: userId ? { userId } : {} });

beforeEach(() => {
  jest.resetAllMocks();
  products.getProductById.mockResolvedValue({ id: 3 });
});
afterEach(() => jest.restoreAllMocks());

test.each([['get', '/me'], ['get', '/9'], ['post', '/'], ['patch', '/9'], ['delete', '/9']])(
  '미인증 %s %s는 캐시 없이 401', async (method, path) => {
    const res = await request(app(null))[method]('/api/reviews' + path).send({});
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('private, no-store');
  }
);

test.each([1, null])('공개 목록 로그인 %p에서도 안전한 스냅샷 응답', async userId => {
  model.getProductReviews.mockResolvedValue({ rows: [{ ...row, user_id: null }], reviewCount: 1, averageRating: 5 });
  const res = await request(productApp(userId)).get('/api/products/3/reviews');
  expect(res.status).toBe(200);
  expect(res.body.data.reviews[0]).toEqual({
    reviewId: 9, nickname: '작성당시', rating: 5, content: '후기', isMine: false,
    createdAt: row.created_at, updatedAt: row.updated_at
  });
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(res.body.meta).toEqual({ page: 1, limit: 10, totalCount: 1, totalPages: 1 });
});
test('로그인 사용자 소유 여부와 전체 평균·페이지 meta', async () => {
  model.getProductReviews.mockResolvedValue({ rows: [row], reviewCount: 12, averageRating: 4.6666 });
  const res = await request(productApp()).get('/api/products/3/reviews?page=2&limit=10&sort=rating_desc');
  expect(res.body.data.summary).toEqual({ averageRating: 4.7, reviewCount: 12 });
  expect(res.body.data.reviews[0].isMine).toBe(true);
  expect(res.body.meta).toEqual({ page: 2, limit: 10, totalCount: 12, totalPages: 2 });
  expect(model.getProductReviews).toHaveBeenCalledWith(3, { page: 2, limit: 10, sort: 'rating_desc', productId: null });
});
test('빈 목록은 0 통계', async () => {
  model.getProductReviews.mockResolvedValue({ rows: [], reviewCount: 0, averageRating: 0 });
  const res = await request(productApp()).get('/api/products/3/reviews');
  expect(res.body.data).toEqual({ summary: { averageRating: 0, reviewCount: 0 }, reviews: [] });
  expect(res.body.meta.totalPages).toBe(0);
});
test('없는 상품은 404', async () => {
  products.getProductById.mockResolvedValue(null);
  const res = await request(productApp()).get('/api/products/3/reviews');
  expect(res.status).toBe(404);
  expect(model.getProductReviews).not.toHaveBeenCalled();
});
test.each([
  ['/api/products/abc/reviews', 'INVALID_PRODUCT_ID'],
  ['/api/products/3/reviews?page=0', 'INVALID_PAGE'],
  ['/api/products/3/reviews?limit=100', 'INVALID_LIMIT'],
  ['/api/products/3/reviews?sort=unsafe', 'INVALID_REVIEW_SORT']
])('잘못된 공개 요청 %s', async (path, code) => {
  const res = await request(productApp()).get(path);
  expect(res.status).toBe(400);
  expect(res.body.code).toBe(code);
  expect(products.getProductById).not.toHaveBeenCalled();
});
test('생성은 서버 세션과 검증된 본문을 모델에 전달', async () => {
  model.createReview.mockResolvedValue(row);
  const res = await request(app()).post('/api/reviews').send({ giftId: 7, rating: 5, content: ' 후기 ' });
  expect(res.status).toBe(201);
  expect(model.createReview).toHaveBeenCalledWith(1, { giftId: 7, rating: 5, content: '후기' });
  expect(res.body.data).toMatchObject({ reviewId: 9, giftId: 7, product: { id: 3 } });
});
test('빈 본문과 보호 필드 주입은 400', async () => {
  expect((await request(app()).post('/api/reviews').send({})).status).toBe(400);
  expect((await request(app()).patch('/api/reviews/9').send({ status: 'visible' })).body.code).toBe('INVALID_REVIEW_BODY');
  expect(model.updateReview).not.toHaveBeenCalled();
});
test.each([
  ['GIFT_NOT_FOUND', 404], ['GIFT_NOT_REVIEWABLE', 403],
  ['REVIEW_ALREADY_EXISTS', 409], ['UNAUTHORIZED', 401]
])('작성 도메인 오류 %s 매핑', async (code, status) => {
  model.createReview.mockRejectedValue(Object.assign(new Error(code), { reviewError: code }));
  const res = await request(app()).post('/api/reviews').send({ giftId: 7, rating: 5, content: '후기' });
  expect(res.status).toBe(status);
  expect(res.body.code).toBe(code);
});
test('DB UNIQUE 중복 오류도 409', async () => {
  model.createReview.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
  const res = await request(app()).post('/api/reviews').send({ giftId: 7, rating: 5, content: '후기' });
  expect(res.status).toBe(409);
});
test('내 리뷰 경로는 :id로 오인하지 않고 필터·페이지를 전달', async () => {
  model.getMyReviews.mockResolvedValue({ rows: [row], totalCount: 1 });
  const res = await request(app()).get('/api/reviews/me?productId=3');
  expect(res.status).toBe(200);
  expect(res.body.code).toBe('MY_REVIEW_LIST_SUCCESS');
  expect(res.body.data[0].product.id).toBe(3);
  expect(res.body.data[0].status).toBe('visible');
  expect(model.getMyReviews).toHaveBeenCalledWith(1, { page: 1, limit: 10, sort: 'latest', productId: 3 });
  expect(model.getReviewById).not.toHaveBeenCalled();
});
test.each([null, 2])('탈퇴·타인 소유(%p) 단건은 거부', async owner => {
  model.getReviewById.mockResolvedValue({ ...row, user_id: owner });
  expect((await request(app()).get('/api/reviews/9')).status).toBe(403);
});
test('본인 단건 및 없는 리뷰', async () => {
  model.getReviewById.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
  expect((await request(app()).get('/api/reviews/9')).body.data.nickname).toBe('작성당시');
  expect((await request(app()).get('/api/reviews/99')).status).toBe(404);
});
test('부분 수정은 입력한 필드만 전달', async () => {
  model.updateReview.mockResolvedValue({ ...row, rating: 3 });
  const res = await request(app()).patch('/api/reviews/9').send({ rating: 3 });
  expect(res.status).toBe(200);
  expect(model.updateReview).toHaveBeenCalledWith(9, 1, { rating: 3 });
});
test('삭제 응답', async () => {
  model.deleteReview.mockResolvedValue({ reviewId: 9 });
  expect((await request(app()).delete('/api/reviews/9')).body.data).toEqual({ reviewId: 9 });
  expect(model.deleteReview).toHaveBeenCalledWith(9, 1);
});
test.each(['get', 'patch', 'delete'])('잘못된 리뷰 ID %s 거부', async method => {
  const res = await request(app())[method]('/api/reviews/nope').send({ rating: 3 });
  expect(res.body.code).toBe('INVALID_REVIEW_ID');
});
test.each(['patch', 'delete'])('타인 수정/삭제 %s 오류 매핑', async method => {
  model[method === 'patch' ? 'updateReview' : 'deleteReview'].mockRejectedValue({ reviewError: 'FORBIDDEN_NOT_REVIEW_OWNER' });
  expect((await request(app())[method]('/api/reviews/9').send({ rating: 3 })).status).toBe(403);
});
test('DB 장애는 SQL·본문을 노출하거나 로그에 기록하지 않음', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  model.getMyReviews.mockRejectedValue({ code: 'ER_DB', sql: 'sensitive review', message: 'secret' });
  const res = await request(app()).get('/api/reviews/me');
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('secret');
  expect(spy).toHaveBeenCalledWith('Review operation failed:', { code: 'ER_DB' });
});
