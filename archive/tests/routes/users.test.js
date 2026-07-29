const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
const userModel = require('../../../db/models/userModel');
const usersRouter = require('../../../routes/users');

describe('GET /api/users/search', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않은 상태면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: {} });

    const res = await request(app).get('/api/users/search').query({ nickname: 'aon' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(userModel.getUserByNickname).not.toHaveBeenCalled();
  });

  test('nickname 쿼리가 없으면 400 REQUIRED_NICKNAME', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/users/search');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_NICKNAME');
  });

  test('일치하는 유저가 없으면 404 USER_NOT_FOUND', async () => {
    userModel.getUserByNickname.mockResolvedValue(null);
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/users/search').query({ nickname: 'ghost' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  test('일치하는 유저가 있으면 200과 함께 userId/nickname 반환', async () => {
    userModel.getUserByNickname.mockResolvedValue({ id: 7, nickname: 'aon' });
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/users/search').query({ nickname: 'aon' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('USER_SEARCH_SUCCESS');
    expect(res.body.data).toEqual({ userId: 7, nickname: 'aon' });
    expect(userModel.getUserByNickname).toHaveBeenCalledWith('aon');
  });
});
