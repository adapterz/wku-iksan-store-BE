const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const adminProductsController = require('../../controllers/adminProductsController');

router.post('/', requireLogin, requireAdmin, adminProductsController.createProduct);
router.patch('/:id', requireLogin, requireAdmin, adminProductsController.updateProduct);
router.patch('/:id/status', requireLogin, requireAdmin, adminProductsController.updateProductStatus);

module.exports = router;
