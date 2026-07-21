const { sendError } = require('../routes/api');

const requireLogin = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  
  return sendError(res, {
    status: 401,
    code: "UNAUTHORIZED"
  });
};

module.exports = requireLogin;
