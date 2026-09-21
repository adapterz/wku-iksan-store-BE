const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminReportsController = require('../../controllers/adminReportsController');

router.get('/', requireLogin, requireAdmin, adminReportsController.getReports);
router.patch('/:id', requireLogin, requireAdmin, adminReportsController.updateReportStatus);

module.exports = router;
