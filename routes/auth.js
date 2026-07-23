const express = require('express');
const router = express.Router();
const userModel = require('../db/models/userModel');
const bcrypt = require('bcrypt');
const requireLogin = require('../middlewares/requireLogin');
const { sendSuccess, sendError } = require('./api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const {
  validateEmail,
  validateSignupPassword,
  validateLoginPassword,
  validateNickname
} = require('../validators/authValidator');

// 동시 가입 요청으로 발생한 DB 중복 오류를 위반한 UNIQUE 제약별로 구분한다.
function getDuplicateUserError(error) {
  if (error.code !== 'ER_DUP_ENTRY') {
    return null;
  }

  const errorMessage = `${error.sqlMessage || ''} ${error.message || ''}`;

  if (errorMessage.includes('uq_users_email')) {
    return ERROR.EMAIL_ALREADY_EXISTS;
  }

  if (errorMessage.includes('uq_users_nickname')) {
    return ERROR.NICKNAME_ALREADY_EXISTS;
  }

  return ERROR.INTERNAL_SERVER_ERROR;
}

// POST /api/auth/signup - 회원가입
router.post('/signup', async (req, res) => {
  try {
    const { email, password, nickname } = req.body || {};

    const emailValidation = validateEmail(email);
    if (emailValidation.errorCode) {
      return sendError(res, ERROR[emailValidation.errorCode]);
    }

    const passwordValidation = validateSignupPassword(password);
    if (passwordValidation.errorCode) {
      return sendError(res, ERROR[passwordValidation.errorCode]);
    }

    const nicknameValidation = validateNickname(nickname);
    if (nicknameValidation.errorCode) {
      return sendError(res, ERROR[nicknameValidation.errorCode]);
    }

    const existingEmail = await userModel.getUserByEmail(emailValidation.value);
    if (existingEmail) {
      return sendError(res, ERROR.EMAIL_ALREADY_EXISTS);
    }

    const existingNickname = await userModel.getUserByNickname(nicknameValidation.value);
    if (existingNickname) {
      return sendError(res, ERROR.NICKNAME_ALREADY_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(passwordValidation.value, 10);
    const newUser = await userModel.createUser(
      emailValidation.value,
      hashedPassword,
      nicknameValidation.value
    );

    return sendSuccess(res, {
      ...SUCCESS.SIGNUP_SUCCESS,
      data: {
        userId: newUser.id,
        email: newUser.email,
        nickname: newUser.nickname,
        createdAt: newUser.created_at
      }
    });

  } catch (error) {
    console.error('Error in POST /api/auth/signup:', error);

    const duplicateError = getDuplicateUserError(error);
    if (duplicateError) {
      return sendError(res, duplicateError);
    }

    return sendError(res);
  }
});

// POST /api/auth/login - 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    const emailValidation = validateEmail(email);
    if (emailValidation.errorCode) {
      return sendError(res, ERROR[emailValidation.errorCode]);
    }

    const passwordValidation = validateLoginPassword(password);
    if (passwordValidation.errorCode) {
      return sendError(res, ERROR[passwordValidation.errorCode]);
    }

    const user = await userModel.getUserByEmail(emailValidation.value);
    if (!user) {
      return sendError(res, ERROR.INVALID_EMAIL_OR_PASSWORD);
    }

    const isMatch = await bcrypt.compare(passwordValidation.value, user.password);
    if (!isMatch) {
      return sendError(res, ERROR.INVALID_EMAIL_OR_PASSWORD);
    }

    // 세션에 사용자 정보 저장
    req.session.userId = user.id;

    return sendSuccess(res, {
      ...SUCCESS.LOGIN_SUCCESS,
      data: {
        userId: user.id,
        email: user.email,
        nickname: user.nickname
      }
    });

  } catch (error) {
    console.error('Error in POST /api/auth/login:', error);
    return sendError(res);
  }
});

// POST /api/auth/logout - 로그아웃
router.post('/logout', requireLogin, async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error in POST /api/auth/logout:', err);
      return sendError(res);
    }
    
    return sendSuccess(res, SUCCESS.LOGOUT_SUCCESS);
  });
});

// GET /api/auth/me - 내 정보 조회
router.get('/me', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await userModel.getUserById(userId);

    if (!user) {
      return sendError(res, ERROR.UNAUTHORIZED);
    }

    return sendSuccess(res, {
      ...SUCCESS.SESSION_VALID,
      data: {
        userId: user.id,
        email: user.email,
        nickname: user.nickname
      }
    });
  } catch (error) {
    console.error('Error in GET /api/auth/me:', error);
    return sendError(res);
  }
});

module.exports = router;
