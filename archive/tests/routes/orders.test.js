const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/orderModel');
jest.mock('../../../db/models/productModel');
jest.mock('../../../db/models/userModel');
const orderModel = require('../../../db/models/orderModel');
const productModel = require('../../../db/models/productModel');
const userModel = require('../../../db/models/userModel');
const ordersRouter = require('../../../routes/orders');

const LOGGED_IN = { userId: 1 };

describe('POST /api/orders', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/orders', ordersRouter, { session: {} });

    const res = await request(app).post('/api/orders').send({ productId: 1, isSelfGift: true });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(productModel.getProductById).not.toHaveBeenCalled();
  });

  test('productId가 없으면 400 REQUIRED_PRODUCT_ID', async () => {
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/orders').send({ isSelfGift: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_PRODUCT_ID');
  });

  test('isSelfGift가 없으면 400 REQUIRED_IS_SELF_GIFT', async () => {
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/orders').send({ productId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_IS_SELF_GIFT');
  });

  test('선물인데 receiverId가 없으면 400 REQUIRED_RECEIVER_ID', async () => {
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/orders').send({ productId: 1, isSelfGift: false });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_RECEIVER_ID');
  });

  test('본인에게 선물하면 400 CANNOT_GIFT_TO_SELF', async () => {
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app)
      .post('/api/orders')
      .send({ productId: 1, isSelfGift: false, receiverId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_GIFT_TO_SELF');
  });

  test('상품이 없으면 404 PRODUCT_NOT_FOUND', async () => {
    productModel.getProductById.mockResolvedValue(null);
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/orders').send({ productId: 999, isSelfGift: true });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  test('수신자가 없으면 404 RECEIVER_NOT_FOUND', async () => {
    productModel.getProductById.mockResolvedValue({ id: 1, price: 1000 });
    userModel.getUserById.mockResolvedValue(null);
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app)
      .post('/api/orders')
      .send({ productId: 1, isSelfGift: false, receiverId: 2 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('RECEIVER_NOT_FOUND');
  });

  test('셀프 선물이 정상 생성되면 201과 orderId/giftId 반환', async () => {
    productModel.getProductById.mockResolvedValue({ id: 1, price: 1000 });
    userModel.getUserById.mockResolvedValue({ id: 1, nickname: 'aon' });
    orderModel.createOrderWithGift.mockResolvedValue({ orderId: 100, giftId: 200 });
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/orders').send({ productId: 1, isSelfGift: true });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('ORDER_CREATE_SUCCESS');
    expect(res.body.data).toEqual({ orderId: 100, giftId: 200 });
    expect(orderModel.createOrderWithGift).toHaveBeenCalledWith(
      1, 'aon', 1, 1, 'aon', 1000, null, true, expect.any(String)
    );
  });

  test('타인에게 선물이 정상 생성되면 201과 orderId/giftId 반환', async () => {
    productModel.getProductById.mockResolvedValue({ id: 5, price: 3000 });
    userModel.getUserById.mockImplementation((id) => {
      if (id === 1) return Promise.resolve({ id: 1, nickname: 'aon' });
      if (id === 2) return Promise.resolve({ id: 2, nickname: 'miku' });
      return Promise.resolve(null);
    });
    orderModel.createOrderWithGift.mockResolvedValue({ orderId: 101, giftId: 201 });
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app)
      .post('/api/orders')
      .send({ productId: 5, isSelfGift: false, receiverId: 2, message: '생일 축하해요' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('ORDER_CREATE_SUCCESS');
    expect(res.body.data).toEqual({ orderId: 101, giftId: 201 });
    expect(userModel.getUserById).toHaveBeenCalledWith(2);
    expect(orderModel.createOrderWithGift).toHaveBeenCalledWith(
      1, 'aon', 5, 2, 'miku', 3000, '생일 축하해요', false, expect.any(String)
    );
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    productModel.getProductById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).post('/api/orders').send({ productId: 1, isSelfGift: true });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /api/orders/:id', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/orders', ordersRouter, { session: {} });

    const res = await request(app).get('/api/orders/1');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(orderModel.getOrderById).not.toHaveBeenCalled();
  });

  test('주문이 없으면 404 ORDER_NOT_FOUND', async () => {
    orderModel.getOrderById.mockResolvedValue(null);
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/orders/999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('ORDER_NOT_FOUND');
  });

  test('내 주문이 아니면 403 FORBIDDEN_NOT_OWNER', async () => {
    orderModel.getOrderById.mockResolvedValue({ id: 1, user_id: 2 });
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/orders/1');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_OWNER');
  });

  test('내 주문이면 200과 상세 정보 반환', async () => {
    orderModel.getOrderById.mockResolvedValue({
      id: 1,
      user_id: 1,
      product_id: 1,
      receiver_id: 1,
      receiver_nickname_snapshot: 'aon',
      total_price: 1000,
      message: null,
      is_self_gift: 1,
      payment_status: 'paid',
      created_at: '2026-07-29T00:00:00.000Z'
    });
    productModel.getProductByIdIgnoringStatus.mockResolvedValue({
      id: 1, name: '상품A', brand: '브랜드A', thumbnail_url: 'a.jpg'
    });
    orderModel.getGiftByOrderId.mockResolvedValue({ id: 5 });
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/orders/1');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ORDER_DETAIL_SUCCESS');
    expect(res.body.data.orderId).toBe(1);
    expect(res.body.data.giftId).toBe(5);
    expect(res.body.data.receiver).toEqual({ userId: 1, nickname: 'aon' });
    expect(res.body.data.product).toEqual({ id: 1, name: '상품A', brand: '브랜드A', thumbnailUrl: 'a.jpg' });
  });

  test('상품이 숨김/단종 처리돼도 과거 주문의 상품 정보는 그대로 반환', async () => {
    orderModel.getOrderById.mockResolvedValue({
      id: 1,
      user_id: 1,
      product_id: 1,
      receiver_id: 1,
      receiver_nickname_snapshot: 'aon',
      total_price: 1000,
      message: null,
      is_self_gift: 1,
      payment_status: 'paid',
      created_at: '2026-07-29T00:00:00.000Z'
    });
    productModel.getProductByIdIgnoringStatus.mockResolvedValue({
      id: 1, name: '단종된 상품', brand: '브랜드A', thumbnail_url: 'a.jpg', status: 'discontinued'
    });
    orderModel.getGiftByOrderId.mockResolvedValue({ id: 5 });
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/orders/1');

    expect(res.status).toBe(200);
    expect(res.body.data.product).toEqual({
      id: 1, name: '단종된 상품', brand: '브랜드A', thumbnailUrl: 'a.jpg'
    });
    expect(productModel.getProductById).not.toHaveBeenCalled();
  });

  test('수신자가 탈퇴해 receiver_id가 NULL이어도 스냅샷 닉네임으로 반환', async () => {
    orderModel.getOrderById.mockResolvedValue({
      id: 1,
      user_id: 1,
      product_id: 1,
      receiver_id: null,
      receiver_nickname_snapshot: 'miku',
      total_price: 1000,
      message: null,
      is_self_gift: 0,
      payment_status: 'paid',
      created_at: '2026-07-29T00:00:00.000Z'
    });
    productModel.getProductByIdIgnoringStatus.mockResolvedValue({
      id: 1, name: '상품A', brand: '브랜드A', thumbnail_url: 'a.jpg'
    });
    orderModel.getGiftByOrderId.mockResolvedValue({ id: 5 });
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/orders/1');

    expect(res.status).toBe(200);
    expect(res.body.data.receiver).toEqual({ userId: null, nickname: 'miku' });
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    orderModel.getOrderById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/orders', ordersRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/orders/1');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
