const express = require('express');
const session = require('express-session');
const request = require('supertest');
const {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions
} = require('../../../constants/session');

function createSessionApp(isProduction) {
  const app = express();

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  app.use(session({
    name: SESSION_COOKIE_NAME,
    secret: 'integration-test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: getSessionCookieOptions(isProduction)
  }));

  app.post('/login', (req, res) => {
    req.session.userId = 1;
    res.status(200).json({ ok: true });
  });

  return app;
}

describe('실제 세션 쿠키 발급', () => {
  test('개발 HTTP 요청에는 Secure 없이 HttpOnly와 SameSite=Lax 쿠키를 발급', async () => {
    const res = await request(createSessionApp(false)).post('/login');
    const cookie = res.headers['set-cookie']?.[0];

    expect(cookie).toContain('connect.sid=');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  test('운영 프록시가 HTTPS 원본 요청을 전달하면 Secure 쿠키를 발급', async () => {
    const res = await request(createSessionApp(true))
      .post('/login')
      .set('X-Forwarded-Proto', 'https');
    const cookie = res.headers['set-cookie']?.[0];

    expect(cookie).toContain('connect.sid=');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
  });

  test('운영 환경에서 HTTP로 판단된 요청에는 Secure 세션 쿠키를 발급하지 않음', async () => {
    const res = await request(createSessionApp(true)).post('/login');

    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
