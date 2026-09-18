const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
jest.mock('../../../db/models/sanctionModel');
const model = require('../../../db/models/sanctionModel');
const router = require('../../../routes/users');
const app = () => createTestApp('/api/users', router, { session: { userId: 7 } });
afterEach(() => jest.resetAllMocks());

test.each([
  ['get', '/api/users/me/sanctions'],
  ['get', '/api/users/me/sanctions/unnotified'],
  ['patch', '/api/users/me/sanctions/notify']
])('%s %s: 비로그인 차단 및 캐시 금지', async (method, path) => {
  const anon = createTestApp('/api/users', router, { session: {} });
  const res = await request(anon)[method](path).send({ sanctionIds: [1] });
  expect(res.status).toBe(401);
  expect(res.headers['cache-control']).toBe('private, no-store');
  expect(model.notifySanctions).not.toHaveBeenCalled();
});

describe('GET /api/users/me/sanctions', () => {
  test('본인 세션의 유저 id로 조회, 페이지네이션 메타 포함', async () => {
    const rows = [
      { id: 11, type: 'warning', reason: '욕설', issued_by: 2, ends_at: null, status: 'active', created_at: '2026-01-01T00:00:00Z' }
    ];
    model.getUserSanctions.mockResolvedValue({ rows, totalCount: 1 });

    const res = await request(app()).get('/api/users/me/sanctions');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('MY_SANCTION_LIST_SUCCESS');
    expect(res.body.data).toEqual([{
      sanctionId: 11, type: 'warning', reason: '욕설', endsAt: null,
      status: 'active', createdAt: '2026-01-01T00:00:00Z'
    }]);
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalCount: 1, totalPages: 1 });
    expect(model.getUserSanctions).toHaveBeenCalledWith(7, { page: 1, limit: 10 });
  });

  test('page/limit이 잘못되면 400', async () => {
    const res = await request(app()).get('/api/users/me/sanctions').query({ limit: '100' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_LIMIT');
    expect(model.getUserSanctions).not.toHaveBeenCalled();
  });
});

describe('GET /api/users/me/sanctions/unnotified', () => {
  test.each([[[]], [[11, 12]]])('id와 개수가 일치: %j', async ids => {
    model.getUnnotifiedWarningIds.mockResolvedValue(ids);

    const res = await request(app()).get('/api/users/me/sanctions/unnotified');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('SANCTION_UNNOTIFIED_SUCCESS');
    expect(res.body.data).toEqual({ count: ids.length, sanctionIds: ids });
    expect(model.getUnnotifiedWarningIds).toHaveBeenCalledWith(7);
  });
});

describe('PATCH /api/users/me/sanctions/notify', () => {
  test.each([{}, { sanctionIds: [] }, { sanctionIds: null }, { sanctionIds: '1' },
    ...[0, -1, 1.2, '1', null, true, {}, [], Number.MAX_SAFE_INTEGER + 1].map(id => ({ sanctionIds: [id] }))
  ])('잘못된 ID 배열 거부: %j', async body => {
    const res = await request(app()).patch('/api/users/me/sanctions/notify').send(body);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SANCTION_IDS');
    expect(model.notifySanctions).not.toHaveBeenCalled();
  });

  test('세션 소유자를 사용하고 중복 ID를 정규화; 같은 요청 재시도도 성공', async () => {
    model.notifySanctions.mockResolvedValue(true);
    for (let i = 0; i < 2; i++) {
      const res = await request(app()).patch('/api/users/me/sanctions/notify').send({ sanctionIds: [12, 11, 12], userId: 99 });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ count: 2, sanctionIds: [11, 12] });
    }
    expect(model.notifySanctions).toHaveBeenCalledWith(7, [11, 12]);
  });

  test('본인 소유가 아니거나 warning이 아닌 ID가 섞이면 공통 404', async () => {
    model.notifySanctions.mockResolvedValue(false);
    const res = await request(app()).patch('/api/users/me/sanctions/notify').send({ sanctionIds: [1, 2] });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('SANCTION_NOTIFICATION_TARGET_NOT_FOUND');
  });
});

test.each(['get', 'patch'])('%s DB 실패 시 성공으로 처리하지 않고 500', async method => {
  model.getUnnotifiedWarningIds.mockRejectedValue(new Error('offline'));
  model.notifySanctions.mockRejectedValue(new Error('offline'));
  const path = method === 'get' ? '/api/users/me/sanctions/unnotified' : '/api/users/me/sanctions/notify';
  const res = await request(app())[method](path).send({ sanctionIds: [1] });
  expect(res.status).toBe(500);
  expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
});
