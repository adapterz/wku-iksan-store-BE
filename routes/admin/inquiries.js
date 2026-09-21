const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminInquiriesController = require('../../controllers/adminInquiriesController');

router.get('/', requireLogin, requireAdmin, adminInquiriesController.getInquiries);
router.patch('/:id', requireLogin, requireAdmin, adminInquiriesController.answerInquiry);

module.exports = router;
