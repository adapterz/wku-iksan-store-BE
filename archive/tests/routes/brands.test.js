const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/brandModel');
const brandModel = require('../../../db/models/brandModel');
const brandsRouter = require('../../../routes/brands');

describe('GET /api/brands', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('keyword가 없으면 대표 브랜드 목록을 반환', async () => {
    brandModel.getBrands.mockResolvedValue([
      { brand: '익산로컬푸드', product_count: 2, thumbnail_url: 'a.jpg' }
    ]);
    const app = createTestApp('/api/brands', brandsRouter);

    const res = await request(app).get('/api/brands');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('BRAND_LIST_SUCCESS');
    expect(brandModel.getBrands).toHaveBeenCalledWith({ keyword: null });
    expect(res.body.data).toEqual([
      { brand: '익산로컬푸드', productCount: 2, thumbnailUrl: 'a.jpg' }
    ]);
  });

  test('keyword의 앞뒤 공백을 제거해 모델에 전달', async () => {
    brandModel.getBrands.mockResolvedValue([]);
    const app = createTestApp('/api/brands', brandsRouter);

    const res = await request(app).get('/api/brands?keyword=%20로컬%20');

    expect(res.status).toBe(200);
    expect(brandModel.getBrands).toHaveBeenCalledWith({ keyword: '로컬' });
    expect(res.body.data).toEqual([]);
  });

  test.each([
    '/api/brands?keyword=',
    '/api/brands?keyword=%20%20',
    `/api/brands?keyword=${'a'.repeat(101)}`,
    '/api/brands?keyword=a&keyword=b'
  ])('잘못된 keyword는 400 INVALID_KEYWORD (%s)', async (path) => {
    const app = createTestApp('/api/brands', brandsRouter);

    const res = await request(app).get(path);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_KEYWORD');
    expect(brandModel.getBrands).not.toHaveBeenCalled();
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    brandModel.getBrands.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/brands', brandsRouter);

    const res = await request(app).get('/api/brands');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
