const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const usersController = require('../controllers/usersController');

// GET /api/users/search?nickname={nickname}
router.get('/search', requireLogin, usersController.searchUser);

module.exports = router;
