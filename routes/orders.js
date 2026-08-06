const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const ordersController = require('../controllers/ordersController');

router.post('/', requireLogin, ordersController.createOrder);
router.get('/:id', requireLogin, ordersController.getOrderDetail);

module.exports = router;
