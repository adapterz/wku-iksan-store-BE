const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminDashboardController = require('../../controllers/adminDashboardController');

router.get('/', requireLogin, requireAdmin, adminDashboardController.getDashboard);

module.exports = router;
