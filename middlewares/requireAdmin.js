const userModel = require('../db/models/userModel');
const { sendError } = require('../routes/api');
const { ERROR } = require('../constants/responseCodes');

// requireLogin 다음에 적용한다(req.session.userId가 있다고 가정).
// role은 세션에 캐싱하지 않고 매 요청마다 짧게 DB로 확인한다 — 권한 회수가
// 즉시 반영돼야 하고, 세션 저장소가 express-session 기본 MemoryStore라
// 특정 유저의 세션을 강제로 무효화할 방법이 없기 때문이다(이슈 #90 3-2절 참고).
const requireAdmin = async (req, res, next) => {
  try {
    const user = await userModel.getUserById(req.session.userId);

    if (!user || user.role !== 'admin') {
      return sendError(res, ERROR.FORBIDDEN_NOT_ADMIN);
    }

    return next();
  } catch (error) {
    console.error('requireAdmin check failed:', error);
    return sendError(res);
  }
};

module.exports = requireAdmin;
