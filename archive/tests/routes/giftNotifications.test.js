const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
jest.mock('../../../db/models/giftModel');
const model = require('../../../db/models/giftModel');
const router = require('../../../routes/gifts');
const app = () => createTestApp('/api/gifts', router, { session: { userId: 7 } });
afterEach(() => jest.resetAllMocks());

test.each(['get', 'patch'])('%s: 비로그인 차단 및 캐시 금지', async method => {
  const anon = createTestApp('/api/gifts', router, { session: {} });
  const res = await request(anon)[method]('/api/gifts/' + (method === 'get' ? 'unnotified' : 'notify'))
    .send({ giftIds: [1] });
  expect(res.status).toBe(401);
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(model.notifyGifts).not.toHaveBeenCalled();
});

test.each([[[]], [[51, 52]]])('조회 ID와 개수가 일치하고 상세 라우터를 호출하지 않음: %j', async ids => {
  model.getUnnotifiedGiftIds.mockResolvedValue(ids);
  const res = await request(app()).get('/api/gifts/unnotified');
  expect(res.status).toBe(200);
  expect(res.body.data).toEqual({ count: ids.length, giftIds: ids });
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(model.getUnnotifiedGiftIds).toHaveBeenCalledWith(7);
  expect(model.getGiftDetailById).not.toHaveBeenCalled();
});

test.each([{}, { giftIds: [] }, { giftIds: null }, { giftIds: '1' },
  ...[0, -1, 1.2, '1', null, true, {}, [], Number.MAX_SAFE_INTEGER + 1].map(id => ({ giftIds: [id] }))
])('잘못된 ID 배열 거부: %j', async body => {
  const res = await request(app()).patch('/api/gifts/notify').send(body);
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('INVALID_GIFT_IDS');
  expect(model.notifyGifts).not.toHaveBeenCalled();
});

test('세션 소유자를 사용하고 중복 ID를 정규화; 같은 요청 재시도도 성공', async () => {
  model.notifyGifts.mockResolvedValue(true);
  for (let i = 0; i < 2; i++) {
    const res = await request(app()).patch('/api/gifts/notify').send({ giftIds: [52, 51, 52], userId: 99 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ count: 2, giftIds: [51, 52] });
    expect(res.headers['cache-control']).toBe('private, no-store');
  }
  expect(model.notifyGifts).toHaveBeenCalledWith(7, [51, 52]);
});

test('소유권/결제 조건 미충족, 없는 ID는 공통 404', async () => {
  model.notifyGifts.mockResolvedValue(false);
  const res = await request(app()).patch('/api/gifts/notify').send({ giftIds: [1, 2] });
  expect(res.status).toBe(404);
  expect(res.body.code).toBe('GIFT_NOTIFICATION_TARGET_NOT_FOUND');
});

test.each(['get', 'patch'])('%s DB 실패 시 성공으로 처리하지 않고 500', async method => {
  model.getUnnotifiedGiftIds.mockRejectedValue(new Error('offline'));
  model.notifyGifts.mockRejectedValue(new Error('offline'));
  const res = await request(app())[method]('/api/gifts/' + (method === 'get' ? 'unnotified' : 'notify'))
    .send({ giftIds: [1] });
  expect(res.status).toBe(500);
  expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
});
