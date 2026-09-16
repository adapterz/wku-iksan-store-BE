const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const inquiriesController = require('../controllers/inquiriesController');
const limits = require('../middlewares/apiRateLimits');

router.post('/', requireLogin, limits.inquiry, inquiriesController.createInquiry);
router.get('/me', requireLogin, inquiriesController.getMyInquiries);

module.exports = router;
