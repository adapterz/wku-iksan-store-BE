const { sendError } = require('../routes/api');
const { ERROR } = require('../constants/responseCodes');
const userModel = require('../db/models/userModel');
const { isValidAuthVersion } = require('../constants/authVersion');
const { cleanupSession } = require('../helpers/sessionCleanup');

const requireLogin = async (req, res, next) => {
  const { userId, authVersion } = req.session || {};
  if (userId && isValidAuthVersion(authVersion)) {
    let user;
    try {
      user = await userModel.getAuthStateById(userId);
    } catch (error) {
      console.error('Authentication lookup failed:', { code: error.code || 'UNKNOWN' });
      return sendError(res);
    }
    if (user && isValidAuthVersion(user.auth_version) && user.auth_version === authVersion) return next();
  }
  try {
    await cleanupSession(req, res);
  } catch (error) {
    // 정리 실패가 보호 API 접근 허용으로 이어져서는 안 된다.
    console.error('Invalid session cleanup failed:', { code: error.code || 'UNKNOWN' });
  }
  return sendError(res, ERROR.UNAUTHORIZED);
};

module.exports = requireLogin;
