const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/productModel');
const productModel = require('../../../db/models/productModel');
const productsRouter = require('../../../routes/products');

describe('GET /api/products', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('목록을 snake_case -> camelCase로 변환해 반환', async () => {
    productModel.getAllProducts.mockResolvedValue([
      { id: 1, name: '상품A', brand: '브랜드A', price: 1000, thumbnail_url: 'a.jpg' }
    ]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PRODUCT_LIST_SUCCESS');
    expect(res.body.data).toEqual([
      { id: 1, name: '상품A', brand: '브랜드A', price: 1000, thumbnailUrl: 'a.jpg' }
    ]);
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    productModel.getAllProducts.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /api/products/:id', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('상품이 없으면 404 PRODUCT_NOT_FOUND', async () => {
    productModel.getProductById.mockResolvedValue(null);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('상품이 있으면 상세 필드를 camelCase로 매핑해 반환', async () => {
    productModel.getProductById.mockResolvedValue({
      id: 1,
      name: '상품A',
      brand: '브랜드A',
      price: 1000,
      thumbnail_url: 'a.jpg',
      description: '설명',
      usage_info: '사용법'
    });
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PRODUCT_DETAIL_SUCCESS');
    expect(res.body.data).toEqual({
      id: 1,
      name: '상품A',
      brand: '브랜드A',
      price: 1000,
      thumbnailUrl: 'a.jpg',
      description: '설명',
      usageInfo: '사용법'
    });
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    productModel.getProductById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
