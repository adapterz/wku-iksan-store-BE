const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
jest.mock('../../../db/pool', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../db/models/reviewModel');
jest.mock('../../../db/models/productModel');
jest.mock('../../../db/redisClient');
const pool = require('../../../db/pool');
const reviews = require('../../../db/models/reviewModel');
const products = require('../../../db/models/productModel');
// 실제 sanctionModel의 시간 비교와 컨트롤러 공통 함수를 함께 실행한다.
const router = require('../../../routes/reviews');
const productRouter = require('../../../routes/products');
const now = Date.parse('2026-09-10T09:00:00Z');
const row = { id: 9, user_id: 1, gift_id: 7, product_id: 3, rating: 5, content: '원문', status: 'visible' };
const app = (userId = 1) => createTestApp('/api/reviews', router, { session: userId ? { userId } : {} });
const writes = [['post', '/api/reviews', 'createReview', 201], ['patch', '/api/reviews/9', 'updateReview', 200]];
const body = method => method === 'post' ? { giftId: 7, rating: 5, content: '후기' } : { content: '수정' };

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  pool.query.mockResolvedValue([[]]);
  reviews.createReview.mockResolvedValue(row);
  reviews.updateReview.mockResolvedValue(row);
});
afterEach(() => jest.restoreAllMocks());

describe.each(writes)('%s %s', (method, url, modelMethod, status) => {
  test('활성 정지는 캐시 없는 403이며 리뷰 모델을 실행하지 않음', async () => {
    pool.query.mockResolvedValue([[{ ends_at: new Date(now + 1000), reason: '비공개 사유' }]]);
    const res = await request(app())[method](url).send(body(method));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SUSPENDED_FROM_REVIEWS');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(JSON.stringify(res.body)).not.toContain('비공개');
    expect(reviews[modelMethod]).not.toHaveBeenCalled();
    const [sql, values] = pool.query.mock.calls[0];
    expect(values).toEqual([1]);
    expect(sql).toContain("type = 'suspension'");
    expect(sql).toContain("status = 'active'");
    expect(sql).not.toMatch(/NOW\s*\(/i);
  });

  test.each([['없음/경고/해제는 SQL 조회 결과 없음', []],
    ['만료', [{ ends_at: new Date(now - 1000) }]],
    ['종료 시각과 정확히 같음', [{ ends_at: new Date(now) }]]])('%s 허용', async (_, rows) => {
    pool.query.mockResolvedValue([rows]);
    const res = await request(app())[method](url).send(body(method));
    expect(res.status).toBe(status);
    expect(reviews[modelMethod]).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.invocationCallOrder[0]).toBeLessThan(reviews[modelMethod].mock.invocationCallOrder[0]);
  });

  test('만료된 이력 뒤에 활성 정지가 남아 있으면 제한', async () => {
    pool.query.mockResolvedValue([[{ ends_at: new Date(now - 1000) }, { ends_at: new Date(now + 1000) }]]);
    expect((await request(app())[method](url).send(body(method))).body.code).toBe('SUSPENDED_FROM_REVIEWS');
    expect(reviews[modelMethod]).not.toHaveBeenCalled();
  });

  test('정지 조회 장애는 500으로 차단하고 SQL/본문을 노출하지 않음', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    pool.query.mockRejectedValue({ code: 'ER_NO_SUCH_TABLE', sql: '비밀 SQL', message: '비밀 메시지' });
    const res = await request(app())[method](url).send(body(method));
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('비밀');
    expect(spy).toHaveBeenCalledWith('Review operation failed:', { code: 'ER_NO_SUCH_TABLE' });
    expect(reviews[modelMethod]).not.toHaveBeenCalled();
  });

  test('미인증/잘못된 입력은 기존 오류를 반환하며 정지 조회하지 않음', async () => {
    expect((await request(app(null))[method](url).send(body(method))).status).toBe(401);
    expect((await request(app())[method](url).send({})).status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

test('정지 중에도 공개·본인 목록/상세·삭제는 기존 권한 규칙으로 처리', async () => {
  pool.query.mockRejectedValue(new Error('조회/삭제는 제재 저장소에 의존하지 않아야 함'));
  products.getProductById.mockResolvedValue({ id: 3 });
  reviews.getProductReviews.mockResolvedValue({ rows: [row], reviewCount: 1, averageRating: 5 });
  reviews.getMyReviews.mockResolvedValue({ rows: [row], totalCount: 1 });
  reviews.getReviewById.mockResolvedValue(row);
  reviews.deleteReview.mockResolvedValue({ reviewId: 9 });
  const publicApp = createTestApp('/api/products', productRouter, { session: { userId: 1 } });
  expect((await request(publicApp).get('/api/products/3/reviews')).status).toBe(200);
  expect((await request(app()).get('/api/reviews/me')).status).toBe(200);
  expect((await request(app()).get('/api/reviews/9')).status).toBe(200);
  expect((await request(app()).delete('/api/reviews/9')).status).toBe(200);
  expect((await request(app(2)).get('/api/reviews/9')).status).toBe(403);
  reviews.deleteReview.mockRejectedValue({ reviewError: 'FORBIDDEN_NOT_REVIEW_OWNER' });
  expect((await request(app(2)).delete('/api/reviews/9')).status).toBe(403);
  expect(pool.query).not.toHaveBeenCalled();
});
