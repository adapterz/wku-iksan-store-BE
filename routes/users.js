const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const reviewCache = require('../middlewares/reviewCache');
const usersController = require('../controllers/usersController');
const mySanctionsController = require('../controllers/mySanctionsController');
const limits = require('../middlewares/apiRateLimits');

// GET /api/users/search?nickname={nickname}
router.get('/search', requireLogin, limits.search, usersController.searchUser);

router.patch('/me/nickname', requireLogin, usersController.updateNickname);
router.patch('/me/email', requireLogin, usersController.updateEmail);
router.patch('/me/password', requireLogin, usersController.updatePassword);
router.delete('/me', requireLogin, usersController.deleteAccount);

// 경고 알림함(이슈 #97) — 개인화된 응답이라 gifts/reviews와 동일하게 캐시를 금지한다.
router.get('/me/sanctions', reviewCache, requireLogin, mySanctionsController.getMySanctions);
router.get('/me/sanctions/unnotified', reviewCache, requireLogin, mySanctionsController.getUnnotifiedSanctions);
router.patch('/me/sanctions/notify', reviewCache, requireLogin, mySanctionsController.notifySanctions);

module.exports = router;
