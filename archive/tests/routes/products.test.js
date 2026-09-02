const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/productModel');
const productModel = require('../../../db/models/productModel');
const productsRouter = require('../../../routes/products');
const productsController = require('../../../controllers/productsController');

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
        category_name: '간식',
        wishlist_count: 3
      }
    ]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PRODUCT_LIST_SUCCESS');
    expect(productModel.getAllProducts).toHaveBeenCalledWith({
      keyword: null,
      categoryId: null,
      brand: null
    });
    expect(res.body.data).toEqual([
      {
        id: 1,
        name: '상품A',
        brand: '브랜드A',
        price: 1000,
        thumbnailUrl: 'a.jpg',
        categoryId: 2,
        categoryName: '간식',
        wishlistCount: 3
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
      categoryId: null,
      brand: null
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
      categoryId: 2,
      brand: null
    });
  });

  test('keyword와 categoryId를 함께 전달하면 두 조건을 모두 모델에 전달', async () => {
    productModel.getAllProducts.mockResolvedValue([]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products?keyword=카페&categoryId=1');

    expect(res.status).toBe(200);
    expect(productModel.getAllProducts).toHaveBeenCalledWith({
      keyword: '카페',
      categoryId: 1,
      brand: null
    });
  });

  test('brand를 전달하면 앞뒤 공백을 제거해 모델에 전달', async () => {
    productModel.getAllProducts.mockResolvedValue([]);
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get('/api/products?brand=%20익산로컬푸드%20');

    expect(res.status).toBe(200);
    expect(productModel.getAllProducts).toHaveBeenCalledWith({
      keyword: null,
      categoryId: null,
      brand: '익산로컬푸드'
    });
    expect(res.body.data).toEqual([]);
  });

  test.each([
    '/api/products?brand=',
    '/api/products?brand=%20%20',
    `/api/products?brand=${'a'.repeat(256)}`,
    '/api/products?brand=a&brand=b'
  ])('잘못된 brand는 400 INVALID_BRAND (%s)', async (path) => {
    const app = createTestApp('/api/products', productsRouter);

    const res = await request(app).get(path);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_BRAND');
    expect(productModel.getAllProducts).not.toHaveBeenCalled();
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
    productsController.resetRankingCache();
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  test('찜 개수와 순위를 포함해 랭킹 목록을 반환', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T08:30:00.000Z'));
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
    expect(res.body.meta).toEqual({
      computedAt: '2026-08-22T08:30:00.000Z'
    });
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

  test('5분 이내 요청은 같은 랭킹과 계산 시각을 반환하고 DB를 다시 조회하지 않음', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T08:30:00.000Z'));
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
      }
    ]);
    const app = createTestApp('/api/products', productsRouter);

    const firstResponse = await request(app).get('/api/products/ranking');
    jest.setSystemTime(new Date('2026-08-22T08:34:59.000Z'));
    const secondResponse = await request(app).get('/api/products/ranking');

    expect(productModel.getProductRanking).toHaveBeenCalledTimes(1);
    expect(secondResponse.body.data).toEqual(firstResponse.body.data);
    expect(secondResponse.body.meta).toEqual(firstResponse.body.meta);
  });

  test('5분이 지나면 랭킹과 계산 시각을 새로 갱신', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-22T08:30:00.000Z'));
    productModel.getProductRanking
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const app = createTestApp('/api/products', productsRouter);

    const firstResponse = await request(app).get('/api/products/ranking');
    jest.setSystemTime(new Date('2026-08-22T08:35:00.000Z'));
    const secondResponse = await request(app).get('/api/products/ranking');

    expect(productModel.getProductRanking).toHaveBeenCalledTimes(2);
    expect(firstResponse.body.meta.computedAt).toBe('2026-08-22T08:30:00.000Z');
    expect(secondResponse.body.meta.computedAt).toBe('2026-08-22T08:35:00.000Z');
  });

  test('캐시가 비어 있을 때 동시 요청이 와도 DB 조회는 한 번만 실행', async () => {
    let resolveRanking;
    productModel.getProductRanking.mockReturnValue(new Promise(resolve => {
      resolveRanking = resolve;
    }));
    const createResponse = () => {
      const response = {};
      response.status = jest.fn(() => response);
      response.json = jest.fn(body => body);
      return response;
    };
    const firstResponse = createResponse();
    const secondResponse = createResponse();

    const responsesPromise = Promise.all([
      productsController.getProductRanking({}, firstResponse),
      productsController.getProductRanking({}, secondResponse)
    ]);

    expect(productModel.getProductRanking).toHaveBeenCalledTimes(1);

    resolveRanking([]);
    await responsesPromise;

    expect(firstResponse.json.mock.calls[0][0].meta)
      .toEqual(secondResponse.json.mock.calls[0][0].meta);
  });

  test('DB 조회 실패는 캐시에 저장하지 않고 다음 요청에서 다시 조회', async () => {
    productModel.getProductRanking
      .mockRejectedValueOnce(new Error('DB down'))
      .mockResolvedValueOnce([]);
    const app = createTestApp('/api/products', productsRouter);

    const failedResponse = await request(app).get('/api/products/ranking');
    const recoveredResponse = await request(app).get('/api/products/ranking');

    expect(failedResponse.status).toBe(500);
    expect(recoveredResponse.status).toBe(200);
    expect(productModel.getProductRanking).toHaveBeenCalledTimes(2);
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
