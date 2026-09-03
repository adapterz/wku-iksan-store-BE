const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const usersController = require('../controllers/usersController');

// GET /api/users/search?nickname={nickname}
router.get('/search', requireLogin, usersController.searchUser);

router.patch('/me/email', requireLogin, usersController.updateEmail);
router.patch('/me/password', requireLogin, usersController.updatePassword);
router.delete('/me', requireLogin, usersController.deleteAccount);

module.exports = router;
