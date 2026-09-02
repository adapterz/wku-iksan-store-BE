const SESSION_COOKIE_NAME = 'connect.sid';
const SESSION_COOKIE_PATH = '/';

function getSessionCookieOptions(isProduction) {
  return {
    secure: isProduction,
    httpOnly: true,
    sameSite: 'lax',
    path: SESSION_COOKIE_PATH
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_PATH,
  getSessionCookieOptions
};
