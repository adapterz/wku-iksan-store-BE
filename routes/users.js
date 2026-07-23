const express = require('express');
const router = express.Router();
const userModel = require('../db/models/userModel');
const requireLogin = require('../middlewares/requireLogin');
const { sendSuccess, sendError } = require('./api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { validateNickname } = require('../validators/authValidator');

// GET /api/users/search?nickname={nickname}
router.get('/search', requireLogin, async (req, res) => {
  try {
    const { nickname } = req.query;

    const nicknameValidation = validateNickname(nickname);
    if (nicknameValidation.errorCode) {
      return sendError(res, ERROR[nicknameValidation.errorCode]);
    }

    const user = await userModel.getUserByNickname(nicknameValidation.value);

    if (!user) {
      return sendError(res, ERROR.USER_NOT_FOUND);
    }

    return sendSuccess(res, {
      ...SUCCESS.USER_SEARCH_SUCCESS,
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
