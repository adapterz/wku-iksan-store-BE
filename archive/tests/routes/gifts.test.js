const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/giftModel');
const giftModel = require('../../../db/models/giftModel');
const giftsRouter = require('../../../routes/gifts');

const LOGGED_IN = { userId: 1 };

describe('GET /api/gifts', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/gifts', giftsRouter, { session: {} });

    const res = await request(app).get('/api/gifts');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('내 선물 목록을 camelCase로 매핑해 반환', async () => {
    giftModel.getGiftsByReceiverId.mockResolvedValue([
      {
        gift_id: 10,
        product_name: '상품A',
        thumbnail_url: 'a.jpg',
        brand: '브랜드A',
        status: 'unused',
        sender_nickname: '보낸사람',
        is_self_gift: 0,
        created_at: '2026-07-29T00:00:00.000Z',
        used_at: null
      }
    ]);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('GIFT_LIST_SUCCESS');
    expect(res.body.data[0]).toMatchObject({ giftId: 10, isSelfGift: false });
    expect(giftModel.getGiftsByReceiverId).toHaveBeenCalledWith(1, undefined);
  });

  test('status=unused 쿼리를 모델에 그대로 전달', async () => {
    giftModel.getGiftsByReceiverId.mockResolvedValue([]);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts').query({ status: 'unused' });

    expect(res.status).toBe(200);
    expect(giftModel.getGiftsByReceiverId).toHaveBeenCalledWith(1, 'unused');
  });

  test('status=used 쿼리를 모델에 그대로 전달', async () => {
    giftModel.getGiftsByReceiverId.mockResolvedValue([]);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts').query({ status: 'used' });

    expect(res.status).toBe(200);
    expect(giftModel.getGiftsByReceiverId).toHaveBeenCalledWith(1, 'used');
  });

  test('알 수 없는 status 값도 검증 없이 그대로 모델에 전달', async () => {
    giftModel.getGiftsByReceiverId.mockResolvedValue([]);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts').query({ status: 'weird' });

    expect(res.status).toBe(200);
    expect(giftModel.getGiftsByReceiverId).toHaveBeenCalledWith(1, 'weird');
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    giftModel.getGiftsByReceiverId.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /api/gifts/:id', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/gifts', giftsRouter, { session: {} });

    const res = await request(app).get('/api/gifts/10');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(giftModel.getGiftDetailById).not.toHaveBeenCalled();
  });

  test('선물이 없으면 404 GIFT_NOT_FOUND', async () => {
    giftModel.getGiftDetailById.mockResolvedValue(null);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts/999');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GIFT_NOT_FOUND');
  });

  test('내 선물이 아니면 403 FORBIDDEN_NOT_OWNER', async () => {
    giftModel.getGiftDetailById.mockResolvedValue({ gift_id: 10, receiver_id: 2 });
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts/10');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_OWNER');
  });

  test('내 선물이면 200과 상세 정보 반환', async () => {
    giftModel.getGiftDetailById.mockResolvedValue({
      gift_id: 10,
      receiver_id: 1,
      product_name: '상품A',
      thumbnail_url: 'a.jpg',
      barcode: '123456789012',
      status: 'unused',
      used_at: null,
      is_self_gift: 1,
      sender_id: 1,
      sender_nickname: '나',
      message: null
    });
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts/10');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('GIFT_DETAIL_SUCCESS');
    expect(res.body.data.giftId).toBe(10);
    expect(res.body.data.isSelfGift).toBe(true);
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    giftModel.getGiftDetailById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts/10');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('PATCH /api/gifts/:id/use', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/gifts', giftsRouter, { session: {} });

    const res = await request(app).patch('/api/gifts/10/use');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(giftModel.getGiftDetailById).not.toHaveBeenCalled();
  });

  test('선물이 없으면 404 GIFT_NOT_FOUND', async () => {
    giftModel.getGiftDetailById.mockResolvedValue(null);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).patch('/api/gifts/999/use');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('GIFT_NOT_FOUND');
  });

  test('내 선물이 아니면 403 FORBIDDEN_NOT_OWNER', async () => {
    giftModel.getGiftDetailById.mockResolvedValue({ gift_id: 10, receiver_id: 2 });
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).patch('/api/gifts/10/use');

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_NOT_OWNER');
  });

  test('이미 사용된 선물이면 409 GIFT_ALREADY_USED', async () => {
    giftModel.getGiftDetailById.mockResolvedValue({ gift_id: 10, receiver_id: 1 });
    giftModel.updateGiftStatusToUsed.mockResolvedValue(0);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).patch('/api/gifts/10/use');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('GIFT_ALREADY_USED');
  });

  test('정상 사용 처리되면 200과 갱신된 상태 반환', async () => {
    giftModel.getGiftDetailById
      .mockResolvedValueOnce({ gift_id: 10, receiver_id: 1 })
      .mockResolvedValueOnce({ gift_id: 10, status: 'used', used_at: '2026-07-29T00:00:00.000Z' });
    giftModel.updateGiftStatusToUsed.mockResolvedValue(1);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).patch('/api/gifts/10/use');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('GIFT_USE_SUCCESS');
    expect(res.body.data).toEqual({ giftId: 10, status: 'used', usedAt: '2026-07-29T00:00:00.000Z' });
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    giftModel.getGiftDetailById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).patch('/api/gifts/10/use');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
