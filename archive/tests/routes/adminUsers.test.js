const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
const userModel = require('../../../db/models/userModel');
const adminUsersRouter = require('../../../routes/admin/users');

const ADMIN_SESSION = { userId: 1 };

describe('PATCH /api/admin/users/:id/role', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않은 상태면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: {} });

    const res = await request(app).patch('/api/admin/users/2/role').send({ role: 'admin' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(userModel.getUserById).not.toHaveBeenCalled();
  });

  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/2/role').send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_ADMIN');
  });

  test('세션 유저가 DB에 없으면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue(null);
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/2/role').send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_ADMIN');
  });

  test('id 파라미터가 유효하지 않으면 400 INVALID_USER_ID', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/abc/role').send({ role: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_USER_ID');
  });

  test('role 값이 유효하지 않으면 400 INVALID_ROLE', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/2/role').send({ role: 'superadmin' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ROLE');
  });

  test('자기 자신을 강등하려 하면 403 CANNOT_DEMOTE_SELF', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/1/role').send({ role: 'user' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_DEMOTE_SELF');
    expect(userModel.updateUserRole).not.toHaveBeenCalled();
  });

  test('자기 자신을 admin으로 유지하는 요청은 허용', async () => {
    userModel.getUserById.mockImplementation(async (id) => {
      if (id === 1) return { id: 1, role: 'admin' };
      return null;
    });
    userModel.updateUserRole.mockResolvedValue({ id: 1, role: 'admin' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/1/role').send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_ROLE_UPDATE_SUCCESS');
  });

  test('대상 유저가 없으면 404 USER_NOT_FOUND', async () => {
    userModel.getUserById.mockImplementation(async (id) => {
      if (id === 1) return { id: 1, role: 'admin' };
      return null;
    });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/999/role').send({ role: 'admin' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('정상 승격 시 200 ADMIN_ROLE_UPDATE_SUCCESS', async () => {
    userModel.getUserById.mockImplementation(async (id) => {
      if (id === 1) return { id: 1, role: 'admin' };
      if (id === 2) return { id: 2, role: 'user' };
      return null;
    });
    userModel.updateUserRole.mockResolvedValue({ id: 2, role: 'admin' });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/2/role').send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_ROLE_UPDATE_SUCCESS');
    expect(res.body.data).toEqual({ userId: 2, role: 'admin' });
    expect(userModel.updateUserRole).toHaveBeenCalledWith(2, 'admin');
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    userModel.getUserById.mockImplementation(async (id) => {
      if (id === 1) return { id: 1, role: 'admin' };
      throw new Error('DB down');
    });
    const app = createTestApp('/api/admin/users', adminUsersRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/users/2/role').send({ role: 'admin' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
