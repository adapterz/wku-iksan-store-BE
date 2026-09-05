const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/categoryModel');
const userModel = require('../../../db/models/userModel');
const categoryModel = require('../../../db/models/categoryModel');
const adminCategoriesRouter = require('../../../routes/admin/categories');

const ADMIN_SESSION = { userId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

describe('POST /api/admin/categories', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/categories').send({ name: '신규카테고리' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_ADMIN');
  });

  test('name이 없으면 400 REQUIRED_CATEGORY_NAME', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/categories').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_CATEGORY_NAME');
  });

  test('name이 50자를 넘으면 400 CATEGORY_NAME_TOO_LONG', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/categories').send({ name: '가'.repeat(51) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CATEGORY_NAME_TOO_LONG');
  });

  test('중복된 이름이면 409 CATEGORY_ALREADY_EXISTS', async () => {
    mockAdminSession();
    const duplicateError = new Error('duplicate');
    duplicateError.code = 'ER_DUP_ENTRY';
    categoryModel.createCategory.mockRejectedValue(duplicateError);
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/categories').send({ name: '음료' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CATEGORY_ALREADY_EXISTS');
  });

  test('정상 등록 시 201 ADMIN_CATEGORY_CREATE_SUCCESS', async () => {
    mockAdminSession();
    categoryModel.createCategory.mockResolvedValue({ id: 7, name: '신규카테고리' });
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/categories').send({ name: '신규카테고리' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('ADMIN_CATEGORY_CREATE_SUCCESS');
    expect(res.body.data).toEqual({ id: 7, name: '신규카테고리' });
  });
});

describe('PATCH /api/admin/categories/:id', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('id가 유효하지 않으면 400 INVALID_CATEGORY_ID', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/categories/abc').send({ name: '변경명' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CATEGORY_ID');
  });

  test('카테고리가 없으면 404 CATEGORY_NOT_FOUND', async () => {
    mockAdminSession();
    categoryModel.updateCategory.mockResolvedValue(null);
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/categories/999').send({ name: '변경명' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CATEGORY_NOT_FOUND');
  });

  test('정상 수정 시 200 ADMIN_CATEGORY_UPDATE_SUCCESS', async () => {
    mockAdminSession();
    categoryModel.updateCategory.mockResolvedValue({ id: 1, name: '변경명' });
    const app = createTestApp('/api/admin/categories', adminCategoriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/categories/1').send({ name: '변경명' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_CATEGORY_UPDATE_SUCCESS');
    expect(categoryModel.updateCategory).toHaveBeenCalledWith(1, '변경명');
  });
});
