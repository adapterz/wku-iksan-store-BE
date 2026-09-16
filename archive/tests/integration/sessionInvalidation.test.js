// 실제 Express 라우터/requireLogin/bcrypt/express-session/쿠키 사용. DB만 메모리 fixture.
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
jest.mock('../../../db/pool', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../../../db/redisClient');
jest.mock('../../../db/models/userModel');
const users = require('../../../db/models/userModel');
const authRouter = require('../../../routes/auth');
const usersRouter = require('../../../routes/users');
const { MAX_AUTH_VERSION } = require('../../../constants/authVersion');
const { getSessionCookieOptions } = require('../../../constants/session');

let records, store, app, errorLog;
const oldPassword = 'OldPassword123!';
const newPassword = 'NewPassword456!';
const snapshot = user => user ? { ...user } : null;
function createApp() {
  const result = express();
  result.use(express.json());
  result.use(session({ secret: 'test-only-session-secret', resave: false, saveUninitialized: false, store, cookie: getSessionCookieOptions(false) }));
  // 테스트 fixture 전용. production 라우트에는 존재하지 않는다.
  result.post('/fixture', (req, res) => { Object.assign(req.session, req.body); res.sendStatus(204); });
  result.use('/api/auth', authRouter);
  result.use('/api/users', usersRouter);
  for (const name of ['orders', 'cartItems', 'orderGroups', 'reviews', 'gifts']) {
    const mount = { cartItems: 'cart-items', orderGroups: 'order-groups' }[name] || name;
    result.use('/api/' + mount, require('../../../routes/' + name));
  }
  result.use('/api/admin/users', require('../../../routes/admin/users'));
  return result;
}
async function login(agent, id = 1, password = oldPassword) {
  return agent.post('/api/auth/login').send({ email: `user${id}@example.test`, password });
}
const change = (agent, password = newPassword) => agent.patch('/api/users/me/password').send({ currentPassword: oldPassword, newPassword: password });
const deletedCookie = response => expect(response.headers['set-cookie']?.[0]).toContain('connect.sid=;');

beforeEach(async () => {
  jest.resetAllMocks();
  const hash = await bcrypt.hash(oldPassword, 4);
  records = new Map([1, 2].map(id => [id, { id, email: `user${id}@example.test`, nickname: `user${id}`, role: id === 1 ? 'admin' : 'user', password: hash, auth_version: 1 }]));
  users.getUserByEmail.mockImplementation(async email => snapshot([...records.values()].find(u => u.email === email)));
  users.getUserById.mockImplementation(async id => snapshot(records.get(id)));
  users.getAuthStateById.mockImplementation(async id => {
    const user = records.get(id);
    return user ? { id, auth_version: user.auth_version } : null;
  });
  users.updateUserPassword.mockImplementation(async (id, hash, version) => {
    const user = records.get(id);
    if (!user || user.auth_version !== version) return false;
    user.password = hash; user.auth_version++; return true;
  });
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  store = new session.MemoryStore();
  app = createApp();
});
afterEach(async () => { await new Promise(resolve => store.clear(resolve)); jest.restoreAllMocks(); });

test('두 기기 기존 세션 차단, 현재 쿠키 제거, 다른 회원 유지, 신 비밀번호만 로그인', async () => {
  const mobile = request.agent(app), pc = request.agent(app), other = request.agent(app);
  expect((await login(mobile)).status).toBe(200);
  await login(pc); await login(other, 2);
  const response = await change(mobile);
  expect(response.body.code).toBe('PASSWORD_UPDATE_SUCCESS'); deletedCookie(response);
  expect(records.get(1).auth_version).toBe(2);
  expect((await mobile.get('/api/auth/me')).status).toBe(401);
  expect((await pc.get('/api/auth/me')).status).toBe(401);
  expect((await other.get('/api/auth/me')).status).toBe(200);
  expect((await login(pc)).status).toBe(401);
  const fresh = await login(pc, 1, newPassword);
  expect(fresh.status).toBe(200); expect(fresh.body.data).not.toHaveProperty('authVersion');
  expect((await pc.get('/api/auth/me')).status).toBe(200);
});

test.each([
  ['get','/api/auth/me'], ['post','/api/orders'], ['get','/api/cart-items'],
  ['post','/api/order-groups'], ['post','/api/reviews'], ['patch','/api/reviews/1'],
  ['get','/api/gifts'], ['patch','/api/admin/users/2/role']
])('구 버전 세션은 실제 보호 라우트 %s %s에서 거부', async (method, path) => {
  const agent = request.agent(app); await login(agent); records.get(1).auth_version++;
  const result = await agent[method](path).send({});
  expect(result.status).toBe(401); expect(result.body.code).toBe('UNAUTHORIZED');
});

test.each([undefined, null, 0, -1, '1', 1.5, MAX_AUTH_VERSION + 1])('유효하지 않은 세션 버전 %p를 보정하지 않음', async authVersion => {
  const agent = request.agent(app); await agent.post('/fixture').send({ userId: 1, authVersion });
  expect((await agent.get('/api/auth/me')).status).toBe(401);
  expect(users.getAuthStateById).not.toHaveBeenCalled();
});

test('탈퇴 회원 거부, DB 조회 오류는 500이며 실패 후 복구 시 원래 세션 사용 가능', async () => {
  const agent = request.agent(app); await login(agent);
  users.getAuthStateById.mockRejectedValueOnce(new Error('DB unavailable'));
  expect((await agent.get('/api/auth/me')).status).toBe(500);
  expect((await agent.get('/api/auth/me')).status).toBe(200);
  records.delete(1);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});

test.each(['normal','stale','legacy','anonymous'])('로그아웃 %s 및 반복 요청은 DB 조회 없이 성공', async mode => {
  const agent = request.agent(app);
  if (mode === 'normal' || mode === 'stale') await login(agent);
  if (mode === 'stale') records.get(1).auth_version++;
  if (mode === 'legacy') await agent.post('/fixture').send({ userId: 1 });
  users.getAuthStateById.mockRejectedValue(new Error('must not query DB'));
  for (let i = 0; i < 2; i++) {
    const result = await agent.post('/api/auth/logout');
    expect(result.status).toBe(200); deletedCookie(result);
  }
  expect(users.getAuthStateById).not.toHaveBeenCalled();
});

test('로그아웃 저장소 삭제 실패: 쿠키 삭제 시도 + 500', async () => {
  const agent = request.agent(app); await login(agent);
  jest.spyOn(store, 'destroy').mockImplementation((sid, cb) => cb(new Error('store failure')));
  const result = await agent.post('/api/auth/logout');
  expect(result.status).toBe(500); deletedCookie(result);
});

test('비밀번호 저장 후 세션 삭제 실패/응답 쿠키 유실에도 기존 쿠키 접근 차단', async () => {
  const agent = request.agent(app); const signedIn = await login(agent);
  const oldCookie = signedIn.headers['set-cookie'][0].split(';')[0];
  jest.spyOn(store, 'destroy').mockImplementation((sid, cb) => cb(new Error('store failure')));
  const result = await change(agent);
  expect(result.status).toBe(200); deletedCookie(result);
  expect((await request(app).get('/api/auth/me').set('Cookie', oldCookie)).status).toBe(401);
});

test('잘못된 비밀번호/입력/DB 갱신 실패에서는 비밀번호와 버전 유지', async () => {
  const agent = request.agent(app); await login(agent);
  const before = snapshot(records.get(1));
  expect((await agent.patch('/api/users/me/password').send({currentPassword:'wrong',newPassword})).body.code).toBe('INVALID_PASSWORD');
  expect((await agent.patch('/api/users/me/password').send({currentPassword:oldPassword,newPassword:'a'})).status).toBe(400);
  users.updateUserPassword.mockRejectedValueOnce(new Error('DB write failed'));
  expect((await change(agent)).status).toBe(500);
  expect(records.get(1)).toEqual(before);
  expect((await agent.get('/api/auth/me')).status).toBe(200);
});

test('동시 비밀번호 변경은 1회만 성공하고 나머지는 409', async () => {
  const a = request.agent(app), b = request.agent(app); await login(a); await login(b);
  let count = 0, release; const gate = new Promise(resolve => { release = resolve; });
  const update = users.updateUserPassword.getMockImplementation();
  users.updateUserPassword.mockImplementation(async (...args) => {
    if (++count === 2) release(); await gate; return update(...args);
  });
  const results = await Promise.all([change(a), change(b,'OtherPass789!')]);
  expect(results.map(r=>r.status).sort()).toEqual([200,409]);
  expect(results.find(r=>r.status===409).body.code).toBe('PASSWORD_CHANGE_CONFLICT');
  expect(records.get(1).auth_version).toBe(2);
});

test('구 비밀번호 로그인 검증 중 DB 버전 변경: 새 버전으로 승격하지 않음', async () => {
  const original = users.getUserByEmail.getMockImplementation();
  users.getUserByEmail.mockImplementationOnce(async email => {
    const old = await original(email); records.get(1).auth_version = 2;
    records.get(1).password = await bcrypt.hash(newPassword,4); return old;
  });
  const agent = request.agent(app); expect((await login(agent)).status).toBe(200);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});

test('인증 검사 이후 갱신된 버전을 구 세션이 사용해 비밀번호 변경하지 못함', async () => {
  const agent = request.agent(app); await login(agent);
  users.getUserById.mockImplementationOnce(async id => { records.get(id).auth_version++; return snapshot(records.get(id)); });
  expect((await change(agent)).status).toBe(401);
  expect(users.updateUserPassword).not.toHaveBeenCalled();
});

test('버전 상한은 순환/초기화하지 않고 변경 거부', async () => {
  records.get(1).auth_version = MAX_AUTH_VERSION;
  const agent = request.agent(app); await login(agent);
  expect((await change(agent)).status).toBe(500);
  expect(records.get(1).auth_version).toBe(MAX_AUTH_VERSION);
  expect(users.updateUserPassword).not.toHaveBeenCalled();
});

test('사용자 입력 authVersion은 로그인 버전에 영향을 주지 않음', async () => {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({email:'user1@example.test',password:oldPassword,authVersion:999});
  expect((await agent.get('/api/auth/me')).status).toBe(200);
});

// 관리자 조회 연동과 실제 저장소/쿠키 경계 회귀 검사.
test('신규 관리자 회원 조회도 구 세션은 401, 권한 회수 후에는 403', async () => {
  const agent = request.agent(app); await login(agent);
  users.getUserByNickname.mockResolvedValue(snapshot(records.get(2)));
  expect((await agent.get('/api/admin/users?nickname=user2')).status).toBe(200);
  records.get(1).role = 'user';
  expect((await agent.get('/api/admin/users?nickname=user2')).status).toBe(403);
  records.get(1).role = 'admin'; records.get(1).auth_version++;
  expect((await agent.get('/api/admin/users?nickname=user2')).status).toBe(401);
});

test('일반 로그아웃은 다른 기기 세션을 무효화하지 않음', async () => {
  const a=request.agent(app), b=request.agent(app); await login(a); await login(b);
  expect((await a.post('/api/auth/logout')).status).toBe(200);
  expect((await a.get('/api/auth/me')).status).toBe(401);
  expect((await b.get('/api/auth/me')).status).toBe(200);
  expect(records.get(1).auth_version).toBe(1);
});

test('실제 MemoryStore 로그인 저장 실패는 500, 인증 쿠키가 남지 않음', async () => {
  const agent=request.agent(app);
  jest.spyOn(store,'set').mockImplementationOnce((sid,data,cb)=>cb(new Error('write failed')));
  const res=await login(agent);
  expect(res.status).toBe(500); deletedCookie(res);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});

test('로그인 세션 재발급 실패도 500으로 종료하고 보호 API 접근 차단', async () => {
  const agent=request.agent(app); await agent.post('/fixture').send({note:'anonymous'});
  jest.spyOn(store,'destroy').mockImplementationOnce((sid,cb)=>cb(new Error('regenerate failed')));
  const res=await login(agent);
  expect(res.status).toBe(500); deletedCookie(res);
  expect((await agent.get('/api/auth/me')).status).toBe(401);
});

test.each([undefined,0,'1',MAX_AUTH_VERSION+1])('DB 인증 버전 %p가 잘못돼도 정상 인증으로 보정하지 않음', async version => {
  const agent=request.agent(app); await login(agent);
  records.get(1).auth_version=version;
  expect((await agent.get('/api/auth/me')).status).toBe(401);
  expect((await login(agent)).status).toBe(500);
});

test('실제 HTTPS 프록시 모의: 로그인과 비밀번호 변경의 Secure 쿠키 설정 일치', async () => {
  const previous=process.env.NODE_ENV; process.env.NODE_ENV='production';
  try {
    const secureApp=express();secureApp.set('trust proxy',1);secureApp.use(express.json());
    secureApp.use(session({secret:'only-secure-test',resave:false,saveUninitialized:false,store,cookie:getSessionCookieOptions(true)}));
    secureApp.use('/api/auth',authRouter);secureApp.use('/api/users',usersRouter);
    const signed=await request(secureApp).post('/api/auth/login').set('X-Forwarded-Proto','https').send({email:'user1@example.test',password:oldPassword});
    expect(signed.status).toBe(200);expect(signed.headers['set-cookie'][0]).toContain('Secure');
    const cookie=signed.headers['set-cookie'][0].split(';')[0];
    const changed=await request(secureApp).patch('/api/users/me/password').set('X-Forwarded-Proto','https').set('Cookie',cookie).send({currentPassword:oldPassword,newPassword});
    expect(changed.status).toBe(200);deletedCookie(changed);expect(changed.headers['set-cookie'][0]).toContain('Secure');
    expect((await request(secureApp).get('/api/auth/me').set('X-Forwarded-Proto','https').set('Cookie',cookie)).status).toBe(401);
  } finally { if(previous===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previous; }
});

test('req.session 자체가 없어도 로그아웃은 쿠키 정리 후 성공',async()=>{
  const bare=express();bare.use('/api/auth',authRouter);
  const res=await request(bare).post('/api/auth/logout');
  expect(res.status).toBe(200);deletedCookie(res);
});
