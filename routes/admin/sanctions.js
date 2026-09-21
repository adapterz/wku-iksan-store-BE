const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminSanctionsController = require('../../controllers/adminSanctionsController');

router.patch('/:id', requireLogin, requireAdmin, adminSanctionsController.liftSanction);

module.exports = router;
