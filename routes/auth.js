const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const authController = require('../controllers/authController');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/logout', requireLogin, authController.logout);
router.get('/me', requireLogin, authController.me);

module.exports = router;
