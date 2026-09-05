const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminCategoriesController = require('../../controllers/adminCategoriesController');

router.post('/', requireLogin, requireAdmin, adminCategoriesController.createCategory);
router.patch('/:id', requireLogin, requireAdmin, adminCategoriesController.updateCategory);

module.exports = router;
