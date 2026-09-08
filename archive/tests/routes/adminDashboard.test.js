const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/dashboardModel');
jest.mock('../../../db/models/reportModel');
const userModel = require('../../../db/models/userModel');
const dashboardModel = require('../../../db/models/dashboardModel');
const reportModel = require('../../../db/models/reportModel');
const adminDashboardRouter = require('../../../routes/admin/dashboard');

const ADMIN_SESSION = { userId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

const productStats = {
  totalCount: 42,
  byBrand: [{ brand: '나이키', count: 12 }],
  hiddenCount: 3
};

afterEach(() => jest.resetAllMocks());

describe('GET /api/admin/dashboard', () => {
  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/dashboard', adminDashboardRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/dashboard');

    expect(res.status).toBe(403);
    expect(dashboardModel.getProductStats).not.toHaveBeenCalled();
  });

  test('정상 조회 시 200과 상품 현황 + 처리 대기 항목', async () => {
    mockAdminSession();
    dashboardModel.getProductStats.mockResolvedValue(productStats);
    dashboardModel.countActiveSuspensions.mockResolvedValue(7);
    reportModel.getReports.mockResolvedValue({ rows: [], totalCount: 5 });
    const app = createTestApp('/api/admin/dashboard', adminDashboardRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_DASHBOARD_SUCCESS');
    expect(reportModel.getReports).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 1 });
    expect(res.body.data).toEqual({
      pendingActions: { reportCount: 5, activeSuspensionCount: 7 },
      products: productStats
    });
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    mockAdminSession();
    dashboardModel.getProductStats.mockRejectedValue(new Error('DB down'));
    dashboardModel.countActiveSuspensions.mockResolvedValue(0);
    reportModel.getReports.mockResolvedValue({ rows: [], totalCount: 0 });
    const app = createTestApp('/api/admin/dashboard', adminDashboardRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/dashboard');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
