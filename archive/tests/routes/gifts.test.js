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

  test('알 수 없는 status는 목록 조회 없이 거절', async () => {
    giftModel.getGiftsByReceiverId.mockResolvedValue([]);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts').query({ status: 'weird' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_GIFT_STATUS');
    expect(giftModel.getGiftsByReceiverId).not.toHaveBeenCalled();
  });

  test('취소됨 탭과 상세: 최초 취소 시각 반환, 후기·바코드 비노출', async () => {
    const gift = { gift_id: 10, receiver_id: 1, status: 'cancelled', payment_status: 'cancelled',
      cancelled_at: '2026-11-06T02:00:00.000Z', barcode: 'private' };
    giftModel.getGiftsByReceiverId.mockResolvedValue([gift]);
    giftModel.getGiftDetailById.mockResolvedValue(gift);
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });
    const list = await request(app).get('/api/gifts?status=cancelled');
    expect(giftModel.getGiftsByReceiverId).toHaveBeenCalledWith(1, 'cancelled');
    expect(list.body.data[0]).toMatchObject({ canReview: false, cancelledAt: gift.cancelled_at });
    const detail = await request(app).get('/api/gifts/10');
    expect(detail.body.data).toMatchObject({ barcode: null, canReview: false, cancelledAt: gift.cancelled_at });
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

  test('숫자가 아닌 ID는 400 INVALID_GIFT_ID', async () => {
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });

    const res = await request(app).get('/api/gifts/nope');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_GIFT_ID');
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

describe.each([
  ['use', 'useGift', 'used', 'usedAt', 'GIFT_USE_SUCCESS'],
  ['cancel', 'cancelGift', 'cancelled', 'cancelledAt', 'GIFT_CANCEL_SUCCESS']
])('PATCH /api/gifts/:id/%s', (path, method, status, timeField, success) => {
  afterEach(() => jest.resetAllMocks());
  const send = (app, id = '10') => request(app).patch('/api/gifts/' + id + '/' + path);
  const app = () => createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });
  test('인증 및 ID 검증이 먼저다', async () => {
    expect((await send(createTestApp('/api/gifts', giftsRouter, { session: {} }))).body.code).toBe('UNAUTHORIZED');
    expect((await send(app(), 'nope')).body.code).toBe('INVALID_GIFT_ID');
    expect(giftModel[method]).not.toHaveBeenCalled();
  });
  test.each([['GIFT_NOT_FOUND',404], ['FORBIDDEN_NOT_OWNER',403], ['GIFT_ALREADY_USED',409]])('모델 오류 %s', async (errorCode, http) => {
    giftModel[method].mockResolvedValue({ errorCode });
    const res = await send(app());
    expect(res.status).toBe(http);
    expect(res.body.code).toBe(errorCode);
  });
  test('수신자는 세션 기준, 상태와 DB 시각을 반환', async () => {
    const data = { giftId: 10, status, [timeField]: '2026-11-06T10:00:00.000Z' };
    giftModel[method].mockResolvedValue({ data });
    const res = await send(app()).send({ receiverId: 999 });
    expect(giftModel[method]).toHaveBeenCalledWith(1, 10);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: success, data });
  });
  test('DB 오류가 나면 기본 500', async () => {
    giftModel[method].mockRejectedValue(new Error('DB down'));
    expect((await send(app())).status).toBe(500);
  });
});

describe('리뷰 연동 선물 응답', () => {
  afterEach(() => jest.resetAllMocks());
  const gift = {
    gift_id: 10, product_id: 3, receiver_id: 1, payment_status: 'paid',
    status: 'used', review_id: null
  };
  test.each([
    [{}, true, null],
    [{ review_id: 9 }, false, 9],
    [{ status: 'unused' }, false, null],
    [{ payment_status: 'pending' }, false, null]
  ])('목록·상세 작성 가능 조건 %p', async (changes, canReview, reviewId) => {
    giftModel.getGiftsByReceiverId.mockResolvedValue([{ ...gift, ...changes }]);
    giftModel.getGiftDetailById.mockResolvedValue({ ...gift, ...changes });
    const app = createTestApp('/api/gifts', giftsRouter, { session: LOGGED_IN });
    const list = await request(app).get('/api/gifts');
    const detail = await request(app).get('/api/gifts/10');
    for (const response of [list, detail]) {
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
    }
    expect(list.body.data[0]).toMatchObject({ productId: 3, canReview, reviewId });
    expect(detail.body.data).toMatchObject({ productId: 3, canReview, reviewId });
  });
  test('미인증 선물 응답에도 no-store', async () => {
    const app = createTestApp('/api/gifts', giftsRouter);
    expect((await request(app).get('/api/gifts')).headers['cache-control']).toBe('private, no-store');
  });
});
