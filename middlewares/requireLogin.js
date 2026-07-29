const { sendError } = require('../routes/api');
const { ERROR } = require('../constants/responseCodes');

const requireLogin = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }

  return sendError(res, ERROR.UNAUTHORIZED);
};

module.exports = requireLogin;
