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
    const regenerate = jest.fn((callback) => callback());
    const save = jest.fn(function saveSession(callback) {
      expect(this.userId).toBe(1);
      callback();
    });
    const app = createTestApp('/api/auth', authRouter, { session: { regenerate, save } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'myS3curePw' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('LOGIN_SUCCESS');
    expect(res.body.data).toEqual({ userId: 1, email: 'user@example.com', nickname: '아온' });
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(regenerate.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]);
  });

  test('세션 ID 재발급에 실패하면 500이고 로그인 성공으로 처리하지 않음', async () => {
    userModel.getUserByEmail.mockResolvedValue({
      id: 1, email: 'user@example.com', nickname: '아온', password: 'hashed-pw'
    });
    bcrypt.compare.mockResolvedValue(true);
    const regenerate = jest.fn((callback) => callback(new Error('regenerate failed')));
    const save = jest.fn((callback) => callback());
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = createTestApp('/api/auth', authRouter, { session: { regenerate, save } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'myS3curePw' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(save).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('새 세션 저장에 실패하면 500이고 로그인 성공으로 처리하지 않음', async () => {
    userModel.getUserByEmail.mockResolvedValue({
      id: 1, email: 'user@example.com', nickname: '아온', password: 'hashed-pw'
    });
    bcrypt.compare.mockResolvedValue(true);
    const regenerate = jest.fn((callback) => callback());
    const save = jest.fn((callback) => callback(new Error('save failed')));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = createTestApp('/api/auth', authRouter, { session: { regenerate, save } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'myS3curePw' });

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
    consoleError.mockRestore();
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

  test('로그인 상태면 세션과 브라우저 쿠키를 제거하고 200 LOGOUT_SUCCESS', async () => {
    const destroy = jest.fn((cb) => cb());
    const app = createTestApp('/api/auth', authRouter, { session: { userId: 1, destroy } });

    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('LOGOUT_SUCCESS');
    expect(destroy).toHaveBeenCalled();
    expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('connect.sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax')
    ]));
  });

  test('운영 환경에서는 로그아웃 쿠키에도 Secure 속성을 적용', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const destroy = jest.fn((cb) => cb());
      const app = createTestApp('/api/auth', authRouter, { session: { userId: 1, destroy } });

      const res = await request(app).post('/api/auth/logout');

      expect(res.status).toBe(200);
      expect(res.headers['set-cookie']).toEqual(expect.arrayContaining([
        expect.stringContaining('connect.sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax')
      ]));
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });

  test('세션 파기에 실패하면 쿠키를 제거하지 않고 500 반환', async () => {
    const destroy = jest.fn((callback) => callback(new Error('destroy failed')));
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const app = createTestApp('/api/auth', authRouter, { session: { userId: 1, destroy } });

    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.headers['set-cookie']).toBeUndefined();
    consoleError.mockRestore();
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
    userModel.getUserById.mockResolvedValue({ id: 1, email: 'user@example.com', nickname: '아온', role: 'user' });
    const app = createTestApp('/api/auth', authRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('SESSION_VALID');
    expect(res.body.data).toEqual({ userId: 1, email: 'user@example.com', nickname: '아온', role: 'user' });
  });

  test('관리자 세션이면 role도 admin으로 반환 (FE 메뉴 표시 판단용, 실제 권한 검증은 requireAdmin이 담당)', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, email: 'admin@example.com', nickname: '관리자', role: 'admin' });
    const app = createTestApp('/api/auth', authRouter, { session: { userId: 1 } });

    const res = await request(app).get('/api/auth/me');

    expect(res.body.data.role).toBe('admin');
  });
});
