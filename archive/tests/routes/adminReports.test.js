const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/reportModel');
jest.mock('../../../db/models/reviewModel');
const userModel = require('../../../db/models/userModel');
const reportModel = require('../../../db/models/reportModel');
const reviewModel = require('../../../db/models/reviewModel');
const adminReportsRouter = require('../../../routes/admin/reports');

const ADMIN_SESSION = { userId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

const reportRow = {
  id: 5, review_id: 9, reporter_id: 2,
  review_content_snapshot: '별로예요', review_rating_snapshot: 1,
  reason: '욕설이 포함되어 있습니다', status: 'pending', created_at: '2026-09-07T00:00:00Z'
};

afterEach(() => jest.resetAllMocks());

describe('GET /api/admin/reports', () => {
  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/reports');

    expect(res.status).toBe(403);
    expect(reportModel.getReports).not.toHaveBeenCalled();
  });

  test('잘못된 status 필터는 400 INVALID_REPORT_STATUS', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/reports?status=unknown');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_REPORT_STATUS');
  });

  test('정상 조회 시 200과 페이지 meta', async () => {
    mockAdminSession();
    reportModel.getReports.mockResolvedValue({ rows: [reportRow], totalCount: 1 });
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/reports?status=pending');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_REPORT_LIST_SUCCESS');
    expect(reportModel.getReports).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 10 });
    expect(res.body.data[0]).toEqual({
      reportId: 5, reviewId: 9, reporterId: 2,
      reviewContentSnapshot: '별로예요', reviewRatingSnapshot: 1,
      reason: '욕설이 포함되어 있습니다', status: 'pending', createdAt: reportRow.created_at
    });
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalCount: 1, totalPages: 1 });
  });
});

describe('PATCH /api/admin/reports/:id', () => {
  test('신고가 없으면 404 REPORT_NOT_FOUND', async () => {
    mockAdminSession();
    reportModel.getReportById.mockResolvedValue(null);
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reports/999').send({ status: 'dismissed' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('REPORT_NOT_FOUND');
  });

  test('dismissed 처리 시 리뷰 상태 변경 로직은 호출하지 않음', async () => {
    mockAdminSession();
    reportModel.getReportById.mockResolvedValue(reportRow);
    reportModel.updateReportStatus.mockResolvedValue({ ...reportRow, status: 'dismissed' });
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reports/5').send({ status: 'dismissed' });

    expect(res.status).toBe(200);
    expect(reviewModel.updateReviewStatus).not.toHaveBeenCalled();
    expect(reportModel.updateReportStatus).toHaveBeenCalledWith(5, 'dismissed');
  });

  test('actioned 처리 시 신고 대상 리뷰를 hidden으로 전환', async () => {
    mockAdminSession();
    reportModel.getReportById.mockResolvedValue(reportRow);
    reviewModel.updateReviewStatus.mockResolvedValue({ reviewId: 9, status: 'hidden' });
    reportModel.updateReportStatus.mockResolvedValue({ ...reportRow, status: 'actioned' });
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reports/5').send({ status: 'actioned' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_REPORT_UPDATE_SUCCESS');
    expect(reviewModel.updateReviewStatus).toHaveBeenCalledWith(9, 'hidden');
    expect(reportModel.updateReportStatus).toHaveBeenCalledWith(5, 'actioned');
  });

  test('review_id가 이미 NULL(리뷰 삭제됨)이면 리뷰 상태 변경을 건너뜀', async () => {
    mockAdminSession();
    reportModel.getReportById.mockResolvedValue({ ...reportRow, review_id: null });
    reportModel.updateReportStatus.mockResolvedValue({ ...reportRow, review_id: null, status: 'actioned' });
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reports/5').send({ status: 'actioned' });

    expect(res.status).toBe(200);
    expect(reviewModel.updateReviewStatus).not.toHaveBeenCalled();
  });

  test('조회 이후 리뷰가 삭제된 레이스에도 신고 처리는 계속 진행(500 아님)', async () => {
    mockAdminSession();
    reportModel.getReportById.mockResolvedValue(reportRow);
    reviewModel.updateReviewStatus.mockRejectedValue(Object.assign(new Error('gone'), { reviewError: 'REVIEW_NOT_FOUND' }));
    reportModel.updateReportStatus.mockResolvedValue({ ...reportRow, status: 'actioned' });
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reports/5').send({ status: 'actioned' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_REPORT_UPDATE_SUCCESS');
    expect(reportModel.updateReportStatus).toHaveBeenCalledWith(5, 'actioned');
  });

  test('리뷰 상태 변경 중 다른 오류는 그대로 500으로 전파', async () => {
    mockAdminSession();
    reportModel.getReportById.mockResolvedValue(reportRow);
    reviewModel.updateReviewStatus.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/admin/reports', adminReportsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/reports/5').send({ status: 'actioned' });

    expect(res.status).toBe(500);
    expect(reportModel.updateReportStatus).not.toHaveBeenCalled();
  });
});
