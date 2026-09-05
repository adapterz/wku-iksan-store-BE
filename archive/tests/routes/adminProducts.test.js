const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/productModel');
jest.mock('../../../db/models/categoryModel');
const userModel = require('../../../db/models/userModel');
const productModel = require('../../../db/models/productModel');
const categoryModel = require('../../../db/models/categoryModel');
const adminProductsRouter = require('../../../routes/admin/products');

const ADMIN_SESSION = { userId: 1 };
const VALID_BODY = { name: '익산 딸기잼', brand: '익산로컬푸드', price: 15000, categoryId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

describe('POST /api/admin/products', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/products').send(VALID_BODY);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_ADMIN');
  });

  test('name이 없으면 400 REQUIRED_PRODUCT_NAME', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/products').send({ ...VALID_BODY, name: undefined });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_PRODUCT_NAME');
  });

  test('brand가 없으면 400 REQUIRED_BRAND', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/products').send({ ...VALID_BODY, brand: undefined });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_BRAND');
  });

  test('price가 없으면 400 REQUIRED_PRICE', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/products').send({ ...VALID_BODY, price: undefined });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_PRICE');
  });

  test('price가 음수면 400 INVALID_PRICE', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/products').send({ ...VALID_BODY, price: -1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PRICE');
  });

  test('선택 필드가 컬럼 길이를 초과하면 400 PRODUCT_FIELD_TOO_LONG', async () => {
    mockAdminSession();
    categoryModel.getCategoryById.mockResolvedValue({ id: 1, name: '음료' });
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app)
      .post('/api/admin/products')
      .send({ ...VALID_BODY, validPeriod: '가'.repeat(301) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCT_FIELD_TOO_LONG');
  });

  test('존재하지 않는 categoryId면 400 INVALID_CATEGORY_ID', async () => {
    mockAdminSession();
    categoryModel.getCategoryById.mockResolvedValue(null);
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/products').send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CATEGORY_ID');
  });

  test('정상 등록 시 201 ADMIN_PRODUCT_CREATE_SUCCESS', async () => {
    mockAdminSession();
    categoryModel.getCategoryById.mockResolvedValue({ id: 1, name: '음료' });
    productModel.createProduct.mockResolvedValue({
      id: 10,
      name: '익산 딸기잼',
      brand: '익산로컬푸드',
      price: 15000,
      category_id: 1,
      category_name: '음료',
      status: 'active'
    });
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).post('/api/admin/products').send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('ADMIN_PRODUCT_CREATE_SUCCESS');
    expect(res.body.data.id).toBe(10);
    expect(res.body.data.status).toBe('active');
  });
});

describe('PATCH /api/admin/products/:id', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('전달된 필드가 없으면 400 EMPTY_PRODUCT_UPDATE', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/products/1').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EMPTY_PRODUCT_UPDATE');
  });

  test('상품이 없으면 404 PRODUCT_NOT_FOUND', async () => {
    mockAdminSession();
    productModel.updateProduct.mockResolvedValue(null);
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/products/999').send({ price: 2000 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('부분 수정 성공 시 200 ADMIN_PRODUCT_UPDATE_SUCCESS', async () => {
    mockAdminSession();
    productModel.updateProduct.mockResolvedValue({ id: 1, price: 2000, status: 'active' });
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/products/1').send({ price: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_PRODUCT_UPDATE_SUCCESS');
    expect(productModel.updateProduct).toHaveBeenCalledWith(1, { price: 2000 });
  });
});

describe('PATCH /api/admin/products/:id/status', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('status 값이 유효하지 않으면 400 INVALID_PRODUCT_STATUS', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/products/1/status').send({ status: 'deleted' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PRODUCT_STATUS');
  });

  test('상품이 없으면 404 PRODUCT_NOT_FOUND', async () => {
    mockAdminSession();
    productModel.updateProductStatus.mockResolvedValue(null);
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/products/999/status').send({ status: 'hidden' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('숨김 처리 성공 시 200 ADMIN_PRODUCT_STATUS_UPDATE_SUCCESS', async () => {
    mockAdminSession();
    productModel.updateProductStatus.mockResolvedValue({ id: 1, status: 'hidden' });
    const app = createTestApp('/api/admin/products', adminProductsRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/products/1/status').send({ status: 'hidden' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_PRODUCT_STATUS_UPDATE_SUCCESS');
    expect(res.body.data.status).toBe('hidden');
    expect(productModel.updateProductStatus).toHaveBeenCalledWith(1, 'hidden');
  });
});
