const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/sanctionModel');
const userModel = require('../../../db/models/userModel');
const sanctionModel = require('../../../db/models/sanctionModel');
const adminSanctionsRouter = require('../../../routes/admin/sanctions');

const ADMIN_SESSION = { userId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

afterEach(() => jest.resetAllMocks());

describe('PATCH /api/admin/sanctions/:id', () => {
  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/sanctions', adminSanctionsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/sanctions/10');

    expect(res.status).toBe(403);
    expect(sanctionModel.liftSanction).not.toHaveBeenCalled();
  });

  test('id가 유효하지 않으면 400 INVALID_SANCTION_ID', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/sanctions', adminSanctionsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/sanctions/abc');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SANCTION_ID');
  });

  test('제재가 없으면 404 SANCTION_NOT_FOUND', async () => {
    mockAdminSession();
    sanctionModel.liftSanction.mockResolvedValue(null);
    const app = createTestApp('/api/admin/sanctions', adminSanctionsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/sanctions/999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SANCTION_NOT_FOUND');
  });

  test('정상 해제 시 200 ADMIN_SANCTION_LIFT_SUCCESS', async () => {
    mockAdminSession();
    sanctionModel.liftSanction.mockResolvedValue({
      id: 10, user_id: 2, type: 'suspension', reason: '반복 위반', issued_by: 1,
      ends_at: '2099-01-01T00:00:00.000Z', status: 'lifted', created_at: '2026-09-07T00:00:00Z'
    });
    const app = createTestApp('/api/admin/sanctions', adminSanctionsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/sanctions/10');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_SANCTION_LIFT_SUCCESS');
    expect(sanctionModel.liftSanction).toHaveBeenCalledWith(10);
    expect(res.body.data.status).toBe('lifted');
  });
});
