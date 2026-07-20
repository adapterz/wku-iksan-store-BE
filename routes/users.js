const express = require('express');
const router = express.Router();
const userModel = require('../db/models/userModel');
const requireLogin = require('../middlewares/requireLogin');

// GET /api/users/search?nickname={nickname}
router.get('/search', requireLogin, async (req, res) => {
  try {
    const { nickname } = req.query;

    if (!nickname) {
      return res.status(404).json({
        status: 404,
        code: "USER_NOT_FOUND",
        message: null,
        data: null
      });
    }

    const user = await userModel.getUserByNickname(nickname);

    if (!user) {
      return res.status(404).json({
        status: 404,
        code: "USER_NOT_FOUND",
        message: null,
        data: null
      });
    }

    return res.status(200).json({
      status: 200,
      code: "USER_SEARCH_SUCCESS",
      message: null,
      data: {
        userId: user.id,
        nickname: user.nickname
      }
    });

  } catch (error) {
    console.error('User search error:', error);
    return res.status(500).json({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: null,
      data: null
    });
  }
});

module.exports = router;
