const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminUsersController = require('../../controllers/adminUsersController');

router.patch('/:id/role', requireLogin, requireAdmin, adminUsersController.updateUserRole);

module.exports = router;
