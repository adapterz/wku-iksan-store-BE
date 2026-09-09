const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const inquiriesController = require('../controllers/inquiriesController');

router.post('/', requireLogin, inquiriesController.createInquiry);
router.get('/me', requireLogin, inquiriesController.getMyInquiries);

module.exports = router;
