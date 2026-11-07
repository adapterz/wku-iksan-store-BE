const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const reviewCache = require('../middlewares/reviewCache');
const inquiriesController = require('../controllers/inquiriesController');
const limits = require('../middlewares/apiRateLimits');

router.post('/', requireLogin, limits.inquiry, inquiriesController.createInquiry);
// 개인화된 응답이라 gifts/reviews/sanctions와 동일하게 캐시를 금지한다.
router.get('/me', reviewCache, requireLogin, inquiriesController.getMyInquiries);

module.exports = router;
