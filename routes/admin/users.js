const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminUsersController = require('../../controllers/adminUsersController');
const adminSanctionsController = require('../../controllers/adminSanctionsController');

router.patch('/:id/role', requireLogin, requireAdmin, adminUsersController.updateUserRole);
router.post('/:id/sanctions', requireLogin, requireAdmin, adminSanctionsController.createSanction);
router.get('/:id/sanctions', requireLogin, requireAdmin, adminSanctionsController.getUserSanctions);

module.exports = router;
