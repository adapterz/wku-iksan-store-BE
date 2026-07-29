const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('bcrypt');
const bcrypt = require('bcrypt');
const userModel = require('../../../db/models/userModel');
const authRouter = require('../../../routes/auth');

describe('POST /api/auth/signup', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  const validBody = { email: 'user@example.com', password: 'myS3curePw', nickname: '아온' };

  test('이메일 형식이 잘못되면 400 INVALID_EMAIL_FORMAT', async () => {
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ ...validBody, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_EMAIL_FORMAT');
    expect(userModel.getUserByEmail).not.toHaveBeenCalled();
  });

  test('이미 가입된 이메일이면 409 EMAIL_ALREADY_EXISTS', async () => {
    userModel.getUserByEmail.mockResolvedValue({ id: 1 });
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app).post('/api/auth/signup').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  test('이미 사용 중인 닉네임이면 409 NICKNAME_ALREADY_EXISTS', async () => {
    userModel.getUserByEmail.mockResolvedValue(null);
    userModel.getUserByNickname.mockResolvedValue({ id: 1 });
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app).post('/api/auth/signup').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NICKNAME_ALREADY_EXISTS');
  });

  test('DB unique 제약 위반(uq_users_email)이면 409 EMAIL_ALREADY_EXISTS로 변환', async () => {
    userModel.getUserByEmail.mockResolvedValue(null);
    userModel.getUserByNickname.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed');
    const dupError = new Error('Duplicate entry');
    dupError.code = 'ER_DUP_ENTRY';
    dupError.sqlMessage = "Duplicate entry 'user@example.com' for key 'uq_users_email'";
    userModel.createUser.mockRejectedValue(dupError);
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app).post('/api/auth/signup').send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  test('정상 가입되면 201 SIGNUP_SUCCESS와 유저 정보 반환', async () => {
    userModel.getUserByEmail.mockResolvedValue(null);
    userModel.getUserByNickname.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-pw');
    userModel.createUser.mockResolvedValue({
      id: 1, email: 'user@example.com', nickname: '아온', created_at: '2026-07-29T00:00:00.000Z'
    });
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app).post('/api/auth/signup').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('SIGNUP_SUCCESS');
    expect(res.body.data).toEqual({
      userId: 1, email: 'user@example.com', nickname: '아온', createdAt: '2026-07-29T00:00:00.000Z'
    });
    expect(bcrypt.hash).toHaveBeenCalledWith('myS3curePw', 10);
  });
});

describe('POST /api/auth/login', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('가입되지 않은 이메일이면 401 INVALID_EMAIL_OR_PASSWORD', async () => {
    userModel.getUserByEmail.mockResolvedValue(null);
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'anything' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  test('비밀번호가 틀리면 401 INVALID_EMAIL_OR_PASSWORD', async () => {
    userModel.getUserByEmail.mockResolvedValue({ id: 1, password: 'hashed-pw' });
    bcrypt.compare.mockResolvedValue(false);
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  test('정상 로그인되면 200 LOGIN_SUCCESS와 유저 정보 반환', async () => {
    userModel.getUserByEmail.mockResolvedValue({
      id: 1, email: 'user@example.com', nickname: '아온', password: 'hashed-pw'
    });
    bcrypt.compare.mockResolvedValue(true);
    const app = createTestApp('/api/auth', authRouter);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'myS3curePw' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('LOGIN_SUCCESS');
    expect(res.body.data).toEqual({ userId: 1, email: 'user@example.com', nickname: '아온' });
  });
});

describe('POST /api/auth/logout', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/auth', authRouter, { session: {} });

    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('로그인 상태면 세션을 파기하고 200 LOGOUT_SUCCESS', async () => {
    const destroy = jest.fn((cb) => cb());
    const app = createTestApp('/api/auth', authRouter, { session: { userId: 1, destroy } });

    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('LOGOUT_SUCCESS');
    expect(destroy).toHaveBeenCalled();
  });
});

describe('GET /api/auth/me', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('로그인하지 않으면 401 UNAUTHORIZED', async () => {
    const app = createTestApp('/api/auth', authRouter, { session: {} });

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('세션은 있지만 유저가 삭제된 경우 401 UNAUTHORIZED', async () => {
    userModel.getUserById.mockResolvedValue(null);
    const app = createTestApp('/api/auth', authRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  test('정상 세션이면 200 SESSION_VALID와 내 정보 반환', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, email: 'user@example.com', nickname: '아온' });
    const app = createTestApp('/api/auth', authRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('SESSION_VALID');
    expect(res.body.data).toEqual({ userId: 1, email: 'user@example.com', nickname: '아온' });
  });
});
