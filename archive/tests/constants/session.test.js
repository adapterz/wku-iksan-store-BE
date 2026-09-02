const {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  getSessionCookieOptions
} = require('../../../constants/session');

describe('세션 쿠키 설정', () => {
  test('개발 환경에서는 HTTP 로컬 테스트가 가능하도록 Secure를 사용하지 않음', () => {
    expect(SESSION_COOKIE_NAME).toBe('connect.sid');
    expect(SESSION_COOKIE_PATH).toBe('/');
    expect(getSessionCookieOptions(false)).toEqual({
      secure: false,
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    });
  });

  test('운영 환경에서는 HTTPS에서만 세션 쿠키를 전송', () => {
    expect(getSessionCookieOptions(true)).toEqual({
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/'
    });
  });
});
