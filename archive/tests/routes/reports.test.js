const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/reviewModel');
jest.mock('../../../db/models/reportModel');
const reviewModel = require('../../../db/models/reviewModel');
const reportModel = require('../../../db/models/reportModel');
const reviewsRouter = require('../../../routes/reviews');

const app = (userId = 1) => createTestApp('/api/reviews', reviewsRouter, { session: userId ? { userId } : {} });

const review = { id: 9, content: '별로예요', rating: 1 };
const reportRow = {
  id: 5, review_id: 9, reporter_id: 1,
  review_content_snapshot: '별로예요', review_rating_snapshot: 1,
  reason: '욕설이 포함되어 있습니다', status: 'pending', created_at: '2026-09-07T00:00:00Z'
};

beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('POST /api/reviews/:id/reports', () => {
  test('미인증이면 401', async () => {
    const res = await request(app(null)).post('/api/reviews/9/reports').send({ reason: '사유' });
    expect(res.status).toBe(401);
    expect(reportModel.createReport).not.toHaveBeenCalled();
  });

  test('id가 유효하지 않으면 400 INVALID_REVIEW_ID', async () => {
    const res = await request(app()).post('/api/reviews/abc/reports').send({ reason: '사유' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REVIEW_ID');
  });

  test('사유가 없으면 400 REQUIRED_REPORT_REASON', async () => {
    const res = await request(app()).post('/api/reviews/9/reports').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_REPORT_REASON');
    expect(reviewModel.getReviewById).not.toHaveBeenCalled();
  });

  test('리뷰가 없으면 404 REVIEW_NOT_FOUND', async () => {
    reviewModel.getReviewById.mockResolvedValue(null);
    const res = await request(app()).post('/api/reviews/9/reports').send({ reason: '사유' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REVIEW_NOT_FOUND');
    expect(reportModel.createReport).not.toHaveBeenCalled();
  });

  test('이미 신고했으면 409 REPORT_ALREADY_EXISTS', async () => {
    reviewModel.getReviewById.mockResolvedValue(review);
    const duplicateError = new Error('duplicate');
    duplicateError.code = 'ER_DUP_ENTRY';
    reportModel.createReport.mockRejectedValue(duplicateError);
    const res = await request(app()).post('/api/reviews/9/reports').send({ reason: '사유' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('REPORT_ALREADY_EXISTS');
  });

  test('정상 접수 시 201, 신고 시점 리뷰 내용/별점을 스냅샷으로 전달', async () => {
    reviewModel.getReviewById.mockResolvedValue(review);
    reportModel.createReport.mockResolvedValue(reportRow);

    const res = await request(app()).post('/api/reviews/9/reports').send({ reason: ' 욕설이 포함되어 있습니다 ' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('REPORT_CREATE_SUCCESS');
    expect(reportModel.createReport).toHaveBeenCalledWith(1, {
      reviewId: 9,
      reviewContentSnapshot: '별로예요',
      reviewRatingSnapshot: 1,
      reason: '욕설이 포함되어 있습니다'
    });
    expect(res.body.data).toEqual({
      reportId: 5, reviewId: 9, reason: '욕설이 포함되어 있습니다',
      status: 'pending', createdAt: reportRow.created_at
    });
  });
});
