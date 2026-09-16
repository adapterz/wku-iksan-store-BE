const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const authController = require('../controllers/authController');
const limits = require('../middlewares/apiRateLimits');

router.post('/signup', limits.signup, authController.signup);
router.post('/login', limits.login, authController.login);
// 무효/구버전/없는 세션도 로그아웃 가능. 다른 보호 경로의 인증은 유지한다.
router.post('/logout', authController.logout);
router.get('/me', requireLogin, authController.me);

module.exports = router;
