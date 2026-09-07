const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/reviewModel');
const userModel = require('../../../db/models/userModel');
const reviewModel = require('../../../db/models/reviewModel');
const adminReviewsRouter = require('../../../routes/admin/reviews');

const ADMIN_SESSION = { userId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

describe('PATCH /api/admin/reviews/:id/status', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않은 상태면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/admin/reviews', adminReviewsRouter, { session: {} });

    const res = await request(app).patch('/api/admin/reviews/9/status').send({ status: 'hidden' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(reviewModel.updateReviewStatus).not.toHaveBeenCalled();
  });

  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/reviews', adminReviewsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reviews/9/status').send({ status: 'hidden' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_ADMIN');
    expect(reviewModel.updateReviewStatus).not.toHaveBeenCalled();
  });

  test('status 값이 없으면 400 REQUIRED_REVIEW_STATUS', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/reviews', adminReviewsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reviews/9/status').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_REVIEW_STATUS');
  });

  test('리뷰가 없으면 404 REVIEW_NOT_FOUND', async () => {
    mockAdminSession();
    reviewModel.updateReviewStatus.mockRejectedValue({ reviewError: 'REVIEW_NOT_FOUND' });
    const app = createTestApp('/api/admin/reviews', adminReviewsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reviews/999/status').send({ status: 'hidden' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REVIEW_NOT_FOUND');
  });

  test('정상 처리 시 200 ADMIN_REVIEW_STATUS_UPDATE_SUCCESS', async () => {
    mockAdminSession();
    reviewModel.updateReviewStatus.mockResolvedValue({ reviewId: 9, status: 'hidden' });
    const app = createTestApp('/api/admin/reviews', adminReviewsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reviews/9/status').send({ status: 'hidden' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_REVIEW_STATUS_UPDATE_SUCCESS');
    expect(res.body.data).toEqual({ reviewId: 9, status: 'hidden' });
    expect(reviewModel.updateReviewStatus).toHaveBeenCalledWith(9, 'hidden');
  });
});
