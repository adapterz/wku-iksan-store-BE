const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/sanctionModel');
const userModel = require('../../../db/models/userModel');
const sanctionModel = require('../../../db/models/sanctionModel');
const adminUsersRouter = require('../../../routes/admin/users');

const ADMIN_SESSION = { userId: 1 };
const admin = { id: 1, role: 'admin' };
const target = { id: 2, role: 'user' };

// requireAdmin과 컨트롤러 둘 다 userModel.getUserById를 부르므로, 세션 유저(관리자)와
// 대상 유저를 id별로 구분해서 응답한다.
function mockAdminAndTarget(targetUser = target) {
  userModel.getUserById.mockImplementation(id => {
    if (id === admin.id) return Promise.resolve(admin);
    if (id === targetUser.id) return Promise.resolve(targetUser);
    return Promise.resolve(null);
  });
}

const sanctionRow = {
  id: 10, user_id: 2, type: 'warning', reason: '욕설', issued_by: 1,
  ends_at: null, status: 'active', created_at: '2026-09-07T00:00:00Z'
};

afterEach(() => jest.resetAllMocks());

describe('POST /api/admin/users/:id/sanctions', () => {
  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/users/2/sanctions').send({ type: 'warning', reason: '사유' });

    expect(res.status).toBe(403);
    expect(sanctionModel.createSanction).not.toHaveBeenCalled();
  });

  test('type이 없으면 400 REQUIRED_SANCTION_TYPE', async () => {
    mockAdminAndTarget();
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/users/2/sanctions').send({ reason: '사유' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_SANCTION_TYPE');
    expect(userModel.getUserById).not.toHaveBeenCalledWith(2);
  });

  test('대상 유저가 없으면 404 USER_NOT_FOUND', async () => {
    userModel.getUserById.mockImplementation(id => Promise.resolve(id === admin.id ? admin : null));
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/users/999/sanctions').send({ type: 'warning', reason: '사유' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
    expect(sanctionModel.createSanction).not.toHaveBeenCalled();
  });

  test('이미 경고가 있으면 409 WARNING_LIMIT_EXCEEDED', async () => {
    mockAdminAndTarget();
    sanctionModel.countWarnings.mockResolvedValue(1);
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/users/2/sanctions').send({ type: 'warning', reason: '두번째 경고' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('WARNING_LIMIT_EXCEEDED');
    expect(sanctionModel.createSanction).not.toHaveBeenCalled();
  });

  test('첫 경고는 정상 등록 (countWarnings 호출)', async () => {
    mockAdminAndTarget();
    sanctionModel.countWarnings.mockResolvedValue(0);
    sanctionModel.createSanction.mockResolvedValue(sanctionRow);
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/users/2/sanctions').send({ type: 'warning', reason: '욕설' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('ADMIN_SANCTION_CREATE_SUCCESS');
    expect(sanctionModel.countWarnings).toHaveBeenCalledWith(2);
    expect(sanctionModel.createSanction).toHaveBeenCalledWith(2, 1, { type: 'warning', reason: '욕설', endsAt: null });
    expect(res.body.data).toEqual({
      sanctionId: 10, userId: 2, type: 'warning', reason: '욕설', issuedBy: 1,
      endsAt: null, status: 'active', createdAt: sanctionRow.created_at
    });
  });

  test('정지는 경고 카운트를 확인하지 않고 바로 등록', async () => {
    mockAdminAndTarget();
    sanctionModel.createSanction.mockResolvedValue({ ...sanctionRow, type: 'suspension', ends_at: '2099-01-01T00:00:00.000Z' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/users/2/sanctions')
      .send({ type: 'suspension', reason: '반복 위반', endsAt: '2099-01-01T00:00:00.000Z' });

    expect(res.status).toBe(201);
    expect(sanctionModel.countWarnings).not.toHaveBeenCalled();
    expect(sanctionModel.createSanction).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/admin/users/:id/sanctions', () => {
  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/users/2/sanctions');

    expect(res.status).toBe(403);
    expect(sanctionModel.getUserSanctions).not.toHaveBeenCalled();
  });

  test('대상 유저가 없으면 404 USER_NOT_FOUND', async () => {
    userModel.getUserById.mockImplementation(id => Promise.resolve(id === admin.id ? admin : null));
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/users/999/sanctions');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('정상 조회 시 200과 페이지 meta', async () => {
    mockAdminAndTarget();
    sanctionModel.getUserSanctions.mockResolvedValue({ rows: [sanctionRow], totalCount: 1 });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/users/2/sanctions');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_SANCTION_LIST_SUCCESS');
    expect(sanctionModel.getUserSanctions).toHaveBeenCalledWith(2, { page: 1, limit: 10 });
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalCount: 1, totalPages: 1 });
  });
});
