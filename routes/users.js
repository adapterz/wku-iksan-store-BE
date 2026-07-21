const express = require('express');
const router = express.Router();
const userModel = require('../db/models/userModel');
const requireLogin = require('../middlewares/requireLogin');
const { sendSuccess, sendError } = require('./api');

// GET /api/users/search?nickname={nickname}
router.get('/search', requireLogin, async (req, res) => {
  try {
    const { nickname } = req.query;

    if (!nickname) {
      return sendError(res, {
        status: 404,
        code: "USER_NOT_FOUND"
      });
    }

    const user = await userModel.getUserByNickname(nickname);

    if (!user) {
      return sendError(res, {
        status: 404,
        code: "USER_NOT_FOUND"
      });
    }

    return sendSuccess(res, {
      code: "USER_SEARCH_SUCCESS",
      data: {
        userId: user.id,
        nickname: user.nickname
      }
    });

  } catch (error) {
    console.error('User search error:', error);
    return sendError(res);
  }
});

module.exports = router;
