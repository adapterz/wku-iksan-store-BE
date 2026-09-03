const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('bcrypt');
const userModel = require('../../../db/models/userModel');
const bcrypt = require('bcrypt');
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

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    userModel.getUserByNickname.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/users/search').query({ nickname: 'aon' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('PATCH /api/users/me/email', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: {} });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'new@test.com', password: 'pw' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(userModel.getUserById).not.toHaveBeenCalled();
  });

  test('이메일 형식이 잘못되면 400 INVALID_EMAIL_FORMAT', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'not-an-email', password: 'pw' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
  });

  test('비밀번호가 없으면 400 REQUIRED_PASSWORD', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'new@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_PASSWORD');
  });

  test('비밀번호가 일치하지 않으면 401 INVALID_PASSWORD', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(false);
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'new@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');
    expect(userModel.updateUserEmail).not.toHaveBeenCalled();
  });

  test('다른 유저가 이미 사용 중인 이메일이면 409 EMAIL_ALREADY_EXISTS', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    userModel.getUserByEmail.mockResolvedValue({ id: 2, email: 'taken@test.com' });
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'taken@test.com', password: 'pw' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  test('본인의 기존 이메일로 재요청하면 정상 처리', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, email: 'me@test.com', password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    userModel.getUserByEmail.mockResolvedValue({ id: 1, email: 'me@test.com' });
    userModel.updateUserEmail.mockResolvedValue({ id: 1, email: 'me@test.com' });
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'me@test.com', password: 'pw' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('EMAIL_UPDATE_SUCCESS');
  });

  test('정상 변경되면 200 EMAIL_UPDATE_SUCCESS와 변경된 이메일 반환', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    userModel.getUserByEmail.mockResolvedValue(null);
    userModel.updateUserEmail.mockResolvedValue({ id: 1, email: 'new@test.com' });
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'new@test.com', password: 'pw' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('EMAIL_UPDATE_SUCCESS');
    expect(res.body.data).toEqual({ userId: 1, email: 'new@test.com' });
    expect(userModel.updateUserEmail).toHaveBeenCalledWith(1, 'new@test.com');
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    userModel.getUserById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/email').send({ email: 'new@test.com', password: 'pw' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('PATCH /api/users/me/password', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: {} });

    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: 'pw', newPassword: 'newSecurePw1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(userModel.getUserById).not.toHaveBeenCalled();
  });

  test('현재 비밀번호가 없으면 400 REQUIRED_PASSWORD', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).patch('/api/users/me/password').send({ newPassword: 'newSecurePw1' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_PASSWORD');
  });

  test('새 비밀번호가 규칙에 안 맞으면 400 PASSWORD_TOO_SHORT', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: 'pw', newPassword: 'short1' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PASSWORD_TOO_SHORT');
  });

  test('현재 비밀번호가 일치하지 않으면 401 INVALID_PASSWORD', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(false);
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: 'wrong', newPassword: 'newSecurePw1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');
    expect(userModel.updateUserPassword).not.toHaveBeenCalled();
  });

  test('정상 변경되면 200 PASSWORD_UPDATE_SUCCESS', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    bcrypt.hash.mockResolvedValue('new-hashed');
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: 'oldPw1', newPassword: 'newSecurePw1' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('PASSWORD_UPDATE_SUCCESS');
    expect(bcrypt.hash).toHaveBeenCalledWith('newSecurePw1', 10);
    expect(userModel.updateUserPassword).toHaveBeenCalledWith(1, 'new-hashed');
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    userModel.getUserById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: 'pw', newPassword: 'newSecurePw1' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('DELETE /api/users/me', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: {} });

    const res = await request(app).delete('/api/users/me').send({ password: 'pw' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(userModel.getUserById).not.toHaveBeenCalled();
  });

  test('비밀번호가 없으면 400 REQUIRED_PASSWORD', async () => {
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).delete('/api/users/me').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_PASSWORD');
  });

  test('비밀번호가 일치하지 않으면 401 INVALID_PASSWORD', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(false);
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).delete('/api/users/me').send({ password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_PASSWORD');
    expect(userModel.deleteUser).not.toHaveBeenCalled();
  });

  test('정상 삭제되면 200 ACCOUNT_DELETE_SUCCESS와 함께 세션 종료', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).delete('/api/users/me').send({ password: 'correctPw' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ACCOUNT_DELETE_SUCCESS');
    expect(userModel.deleteUser).toHaveBeenCalledWith(1);
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    userModel.getUserById.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/users', usersRouter, { session: { userId: 1 } });

    const res = await request(app).delete('/api/users/me').send({ password: 'pw' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
