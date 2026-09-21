const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { sendError } = require('../routes/api');
const { ERROR } = require('../constants/responseCodes');

// 단일 BE 프로세스용 메모리 카운터. 운영 임계값은 검토 가능한 초기값이며 env로 조정한다.
function readLimit(env, name, fallback) {
  if (env[name] === undefined || env[name] === '') return fallback;
  if (!/^[1-9]\d*$/.test(env[name])) throw new Error(`Invalid ${name}`);
  const value = Number(env[name]);
  if (!Number.isSafeInteger(value)) throw new Error(`Invalid ${name}`);
  return value;
}

function createApiRateLimiters(env = process.env) {
  const make = (name, windowMs, fallback, account = false) => rateLimit({
    windowMs,
    limit: readLimit(env, name, fallback),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // 인증 이후에만 회원 키 사용. body의 userId, 이메일, session ID는 키로 사용하지 않는다.
    ...(account ? { keyGenerator: req => req.session?.userId
      ? `user:${req.session.userId}` : `ip:${ipKeyGenerator(req.ip)}` } : {}),
    handler: (req, res) => sendError(res, ERROR.TOO_MANY_REQUESTS)
  });
  return {
    login: make('RATE_LIMIT_LOGIN_MAX', 15 * 60 * 1000, 100),
    signup: make('RATE_LIMIT_SIGNUP_MAX', 60 * 60 * 1000, 30),
    inquiry: make('RATE_LIMIT_INQUIRY_MAX', 10 * 60 * 1000, 60, true),
    report: make('RATE_LIMIT_REPORT_MAX', 10 * 60 * 1000, 60, true),
    search: make('RATE_LIMIT_SEARCH_MAX', 10 * 60 * 1000, 60, true)
  };
}

module.exports = { ...createApiRateLimiters(), createApiRateLimiters };
