const { SESSION_COOKIE_NAME, getSessionCookieOptions } = require('../constants/session');

// DB 버전 무효화와 별개로 현재 요청의 세션/쿠키를 정리한다.
// 저장소 오류도 쿠키 제거를 막지 않으며, 호출자가 성공/실패 정책을 결정한다.
async function cleanupSession(req, res) {
  try {
    if (req.session) {
      delete req.session.userId;
      delete req.session.authVersion;
      await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    }
  } finally {
    res.clearCookie(SESSION_COOKIE_NAME, getSessionCookieOptions(process.env.NODE_ENV === 'production'));
  }
}

module.exports = { cleanupSession };
