const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/productModel');
const productModel = require('../../../db/models/productModel');
const productsRouter = require('../../../routes/products');

describe('GET /api/products', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('조건이 없으면 전체 상품과 카테고리 정보를 반환', async () => {
    productModel.getAllProducts.mockResolvedValue([
      {
        id: 1,
        name: '상품A',
        brand: '브랜드A',
        price: 1000,
        thumbnail_url: 'a.jpg',
        category_id: 2,
        category_name: '간식'
      }
    ]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PRODUCT_LIST_SUCCESS');
    expect(productModel.getAllProducts).toHaveBeenCalledWith({
      keyword: null,
      categoryId: null
    });
    expect(res.body.data).toEqual([
      {
        id: 1,
        name: '상품A',
        brand: '브랜드A',
        price: 1000,
        thumbnailUrl: 'a.jpg',
        categoryId: 2,
        categoryName: '간식'
      }
    ]);
  });

  test('상품명·브랜드 검색어의 앞뒤 공백을 제거해 모델에 전달', async () => {
    productModel.getAllProducts.mockResolvedValue([]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products?keyword=%20아메리카노%20');

    expect(res.status).toBe(200);
    expect(productModel.getAllProducts).toHaveBeenCalledWith({
      keyword: '아메리카노',
      categoryId: null
    });
    expect(res.body.data).toEqual([]);
  });

  test('categoryId를 양의 정수로 변환해 모델에 전달', async () => {
    productModel.getAllProducts.mockResolvedValue([]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products?categoryId=2');

    expect(res.status).toBe(200);
    expect(productModel.getAllProducts).toHaveBeenCalledWith({
      keyword: null,
      categoryId: 2
    });
  });

  test('keyword와 categoryId를 함께 전달하면 두 조건을 모두 모델에 전달', async () => {
    productModel.getAllProducts.mockResolvedValue([]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products?keyword=카페&categoryId=1');

    expect(res.status).toBe(200);
    expect(productModel.getAllProducts).toHaveBeenCalledWith({
      keyword: '카페',
      categoryId: 1
    });
  });

  test.each([
    '/api/products?keyword=',
    '/api/products?keyword=%20%20',
    `/api/products?keyword=${'a'.repeat(101)}`,
    '/api/products?keyword=a&keyword=b'
  ])('잘못된 검색어는 400 INVALID_KEYWORD (%s)', async (path) => {
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get(path);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_KEYWORD');
    expect(productModel.getAllProducts).not.toHaveBeenCalled();
  });

  test.each(['0', '-1', '1.5', 'abc'])('잘못된 categoryId는 400 INVALID_CATEGORY_ID (%s)', async (categoryId) => {
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get(`/api/products?categoryId=${categoryId}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CATEGORY_ID');
    expect(productModel.getAllProducts).not.toHaveBeenCalled();
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    productModel.getAllProducts.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /api/products/ranking', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('찜 개수와 순위를 포함해 랭킹 목록을 반환', async () => {
    productModel.getProductRanking.mockResolvedValue([
      {
        id: 1,
        name: '상품A',
        brand: '브랜드A',
        price: 1000,
        thumbnail_url: 'a.jpg',
        category_id: 2,
        category_name: '간식',
        wishlist_count: 5
      },
      {
        id: 2,
        name: '상품B',
        brand: '브랜드B',
        price: 2000,
        thumbnail_url: 'b.jpg',
        category_id: 3,
        category_name: '음료',
        wishlist_count: 3
      }
    ]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/ranking');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PRODUCT_RANKING_SUCCESS');
    expect(res.body.data).toEqual([
      {
        rank: 1,
        id: 1,
        name: '상품A',
        brand: '브랜드A',
        price: 1000,
        thumbnailUrl: 'a.jpg',
        categoryId: 2,
        categoryName: '간식',
        wishlistCount: 5
      },
      {
        rank: 2,
        id: 2,
        name: '상품B',
        brand: '브랜드B',
        price: 2000,
        thumbnailUrl: 'b.jpg',
        categoryId: 3,
        categoryName: '음료',
        wishlistCount: 3
      }
    ]);
  });

  test('찜한 상품이 없으면 빈 배열 반환', async () => {
    productModel.getProductRanking.mockResolvedValue([]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/ranking');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    productModel.getProductRanking.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/ranking');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /api/products/:id', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test.each(['0', '-1', '1.5', 'abc', '01', '9007199254740992'])(
    'productId가 양의 정수 경로 값이 아니면 400 INVALID_PRODUCT_ID (%s)',
    async productId => {
      const app = createTestApp('/api/products', productsRouter);

      const res = await request(app).get(`/api/products/${productId}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PRODUCT_ID');
      expect(productModel.getProductById).not.toHaveBeenCalled();
    }
  );

  test('상품이 없으면 404 PRODUCT_NOT_FOUND', async () => {
    productModel.getProductById.mockResolvedValue(null);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    expect(productModel.getProductById).toHaveBeenCalledWith(999);
  });

  test('상품이 있으면 상세 필드를 camelCase로 매핑해 반환', async () => {
    productModel.getProductById.mockResolvedValue({
      id: 1,
      name: '상품A',
      brand: '브랜드A',
      price: 1000,
      thumbnail_url: 'a.jpg',
      description: '설명',
      usage_info: '사용법',
      category_id: 2,
      category_name: '간식'
    });
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products/1');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PRODUCT_DETAIL_SUCCESS');
    expect(productModel.getProductById).toHaveBeenCalledWith(1);
    expect(res.body.data).toEqual({
      id: 1,
      name: '상품A',
      brand: '브랜드A',
      price: 1000,
      thumbnailUrl: 'a.jpg',
      description: '설명',
      usageInfo: '사용법',
      categoryId: 2,
      categoryName: '간식'
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
