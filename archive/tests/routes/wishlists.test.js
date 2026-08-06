const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/wishlistModel');
jest.mock('../../../db/models/productModel');
const wishlistModel = require('../../../db/models/wishlistModel');
const productModel = require('../../../db/models/productModel');
const wishlistsRouter = require('../../../routes/wishlists');

const LOGGED_IN = { userId: 1 };

describe('POST /api/wishlists', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: {} });

    const res = await request(app).post('/api/wishlists').send({ productId: 1 });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(productModel.getProductById).not.toHaveBeenCalled();
  });

  test.each([
    {},
    { productId: null },
    { productId: '' }
  ])('productId가 없으면 400 REQUIRED_PRODUCT_ID (%p)', async body => {
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/wishlists').send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_PRODUCT_ID');
    expect(productModel.getProductById).not.toHaveBeenCalled();
  });

  test.each(['1', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'productId가 양의 정수 Number가 아니면 400 INVALID_PRODUCT_ID (%p)',
    async productId => {
      const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

      const res = await request(app).post('/api/wishlists').send({ productId });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PRODUCT_ID');
      expect(productModel.getProductById).not.toHaveBeenCalled();
    }
  );

  test('상품이 없으면 404 PRODUCT_NOT_FOUND', async () => {
    productModel.getProductById.mockResolvedValue(null);
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/wishlists').send({ productId: 999 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
    expect(wishlistModel.createWishlist).not.toHaveBeenCalled();
  });

  test('찜 등록에 성공하면 201과 생성 정보를 반환', async () => {
    productModel.getProductById.mockResolvedValue({ id: 1 });
    wishlistModel.createWishlist.mockResolvedValue({
      id: 10,
      product_id: 1,
      created_at: '2026-08-06T10:00:00.000Z'
    });
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/wishlists').send({ productId: 1 });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('WISHLIST_CREATE_SUCCESS');
    expect(res.body.data).toEqual({
      wishlistId: 10,
      productId: 1,
      createdAt: '2026-08-06T10:00:00.000Z'
    });
    expect(wishlistModel.createWishlist).toHaveBeenCalledWith(1, 1);
  });

  test('동시 등록으로 UNIQUE 제약이 위반되면 409 PRODUCT_ALREADY_WISHED', async () => {
    productModel.getProductById.mockResolvedValue({ id: 1 });
    const duplicateError = new Error('Duplicate entry');
    duplicateError.code = 'ER_DUP_ENTRY';
    wishlistModel.createWishlist.mockRejectedValue(duplicateError);
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/wishlists').send({ productId: 1 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRODUCT_ALREADY_WISHED');
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    productModel.getProductById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/wishlists').send({ productId: 1 });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('DELETE /api/wishlists/:productId', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: {} });

    const res = await request(app).delete('/api/wishlists/1');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(wishlistModel.deleteWishlist).not.toHaveBeenCalled();
  });

  test.each(['0', '-1', '1.5', 'abc', '01'])(
    'productId가 양의 정수 경로 값이 아니면 400 INVALID_PRODUCT_ID (%s)',
    async productId => {
      const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

      const res = await request(app).delete(`/api/wishlists/${productId}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PRODUCT_ID');
      expect(wishlistModel.deleteWishlist).not.toHaveBeenCalled();
    }
  );

  test('찜을 해제하면 200과 productId를 반환', async () => {
    wishlistModel.deleteWishlist.mockResolvedValue(1);
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).delete('/api/wishlists/3');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('WISHLIST_REMOVE_SUCCESS');
    expect(res.body.data).toEqual({ productId: 3 });
    expect(wishlistModel.deleteWishlist).toHaveBeenCalledWith(1, 3);
  });

  test('이미 해제된 찜을 다시 해제해도 200으로 멱등 처리', async () => {
    wishlistModel.deleteWishlist.mockResolvedValue(0);
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).delete('/api/wishlists/3');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('WISHLIST_REMOVE_SUCCESS');
    expect(res.body.data).toEqual({ productId: 3 });
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    wishlistModel.deleteWishlist.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).delete('/api/wishlists/1');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /api/wishlists', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: {} });

    const res = await request(app).get('/api/wishlists');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(wishlistModel.getWishlistsByUserId).not.toHaveBeenCalled();
  });

  test('찜이 없으면 200과 빈 배열을 반환', async () => {
    wishlistModel.getWishlistsByUserId.mockResolvedValue([]);
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/wishlists');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('WISHLIST_LIST_SUCCESS');
    expect(res.body.data).toEqual([]);
    expect(wishlistModel.getWishlistsByUserId).toHaveBeenCalledWith(1);
  });

  test('회원별 찜 목록을 설계된 응답 구조로 변환', async () => {
    wishlistModel.getWishlistsByUserId.mockResolvedValue([
      {
        wishlist_id: 10,
        product_id: 1,
        product_name: '익산역 아메리카노 교환권',
        product_brand: '익산역점',
        product_price: 4500,
        thumbnail_url: '/images/product_1.png',
        category_id: 1,
        category_name: '음료',
        created_at: '2026-08-06T10:00:00.000Z'
      }
    ]);
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/wishlists');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('WISHLIST_LIST_SUCCESS');
    expect(res.body.data).toEqual([
      {
        wishlistId: 10,
        product: {
          id: 1,
          name: '익산역 아메리카노 교환권',
          brand: '익산역점',
          price: 4500,
          thumbnailUrl: '/images/product_1.png',
          categoryId: 1,
          categoryName: '음료'
        },
        createdAt: '2026-08-06T10:00:00.000Z'
      }
    ]);
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    wishlistModel.getWishlistsByUserId.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/wishlists', wishlistsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/wishlists');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
