const express = require('express');
const request = require('supertest');
const { createApiRateLimiters } = require('../../../middlewares/apiRateLimits');

function fixture(env = {}) {
  const limits = createApiRateLimiters({ RATE_LIMIT_LOGIN_MAX:'2', RATE_LIMIT_SIGNUP_MAX:'2', RATE_LIMIT_INQUIRY_MAX:'2', RATE_LIMIT_REPORT_MAX:'2', RATE_LIMIT_SEARCH_MAX:'2', ...env });
  const app = express();
  // 이 테스트 앱에서는 supertest를 한 단계의 신뢰 프록시로 모의한다.
  app.set('trust proxy',1);
  app.use(express.json());
  app.use((req,res,next)=>{
    // 테스트 전용 세션. 실제 앱은 requireLogin이 검증한 서버 세션만 사용한다.
    req.session = {userId:req.get('X-Test-User')||undefined}; next();
  });
  app.post('/login',limits.login,(req,res)=>res.sendStatus(200));
  app.post('/signup',limits.signup,(req,res)=>res.sendStatus(201));
  app.post('/inquiry',limits.inquiry,(req,res)=>res.sendStatus(201));
  app.post('/report/:id',limits.report,(req,res)=>res.sendStatus(201));
  app.get('/search',limits.search,(req,res)=>res.sendStatus(200));
  app.post('/logout',(req,res)=>res.sendStatus(200));
  return app;
}
test('정확히 상한까지 허용 후 429 + 기존 오류 구조/재시도 헤더',async()=>{
  const app=fixture();
  expect((await request(app).post('/login')).status).toBe(200);
  expect((await request(app).post('/login')).status).toBe(200);
  const blocked=await request(app).post('/login');
  expect(blocked.status).toBe(429);
  expect(blocked.body).toMatchObject({status:429,code:'TOO_MANY_REQUESTS',data:null});
  expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  expect(blocked.headers.ratelimit).toBeDefined();
  expect((await request(app).post('/logout')).status).toBe(200);
  expect((await request(app).post('/signup')).status).toBe(201);
});
test('IP별 격리 및 프록시 체인의 왼쪽 값만 바꾸는 우회 방지',async()=>{
  const app=fixture();
  for(let i=0;i<2;i++)await request(app).post('/login').set('X-Forwarded-For','203.0.113.1');
  expect((await request(app).post('/login').set('X-Forwarded-For','203.0.113.1')).status).toBe(429);
  expect((await request(app).post('/login').set('X-Forwarded-For','203.0.113.2')).status).toBe(200);
  expect((await request(app).post('/login').set('X-Forwarded-For','198.51.100.9, 203.0.113.1')).status).toBe(429);
});
test('IPv6 같은 /56 내 주소 변경으로 우회 불가',async()=>{
  const app=fixture();
  for(const ip of ['2001:db8:1234:ab00::1','2001:db8:1234:ab01::2'])await request(app).post('/login').set('X-Forwarded-For',ip);
  expect((await request(app).post('/login').set('X-Forwarded-For','2001:db8:1234:ab02::3')).status).toBe(429);
});
test('회원별 제한: IP/리뷰/본문 userId 변경은 우회 불가, 다른 회원과 문의는 독립',async()=>{
  const app=fixture();
  for(let i=0;i<2;i++)await request(app).post('/report/'+i).set('X-Test-User','1');
  expect((await request(app).post('/report/99').set('X-Test-User','1').set('X-Forwarded-For','203.0.113.9').send({userId:2})).status).toBe(429);
  expect((await request(app).post('/report/99').set('X-Test-User','2')).status).toBe(201);
  expect((await request(app).post('/inquiry').set('X-Test-User','1')).status).toBe(201);
});
test('닉네임 검색 회원별 제한: 회원용/관리자용이 같은 카운터를 공유하고 다른 회원과는 독립',async()=>{
  const app=fixture();
  for(let i=0;i<2;i++)expect((await request(app).get('/search').set('X-Test-User','1')).status).toBe(200);
  expect((await request(app).get('/search').set('X-Test-User','1')).status).toBe(429);
  expect((await request(app).get('/search').set('X-Test-User','2')).status).toBe(200);
});
test('신뢰 프록시 없는 개발 환경은 X-Forwarded-For로 카운터를 변경할 수 없음',async()=>{
  const app=fixture(); app.set('trust proxy',false);
  const log=jest.spyOn(console,'error').mockImplementation(()=>{});
  try {
    for(let i=0;i<2;i++)await request(app).post('/login').set('X-Forwarded-For',`203.0.113.${i}`);
    expect((await request(app).post('/login').set('X-Forwarded-For','203.0.113.10')).status).toBe(429);
  } finally {log.mockRestore();}
});
test('시간 창이 지나면 요청을 다시 허용',async()=>{
  jest.useFakeTimers({doNotFake:['nextTick','setImmediate']});
  try {
    const app=fixture();
    for(let i=0;i<2;i++)await request(app).post('/login');
    expect((await request(app).post('/login')).status).toBe(429);
    jest.advanceTimersByTime(15*60*1000+1);
    expect((await request(app).post('/login')).status).toBe(200);
  } finally {jest.useRealTimers();}
});
test.each(['0','-1','1.5','bad','Infinity','9007199254740992'])('잘못된 설정 %s를 제한 해제로 해석하지 않음',value=>{
  expect(()=>createApiRateLimiters({RATE_LIMIT_LOGIN_MAX:value})).toThrow('RATE_LIMIT_LOGIN_MAX');
});
