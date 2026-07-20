const express = require('express');
const router = express.Router();
const userModel = require('../db/models/userModel');
const bcrypt = require('bcrypt');
const requireLogin = require('../middlewares/requireLogin');

// POST /api/auth/signup - 회원가입
router.post('/signup', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    if (!email) {
      return res.status(400).json({ status: 400, code: "REQUIRED_EMAIL", message: null, data: null });
    }
    if (!password) {
      return res.status(400).json({ status: 400, code: "REQUIRED_PASSWORD", message: null, data: null });
    }
    if (!nickname) {
      return res.status(400).json({ status: 400, code: "REQUIRED_NICKNAME", message: null, data: null });
    }

    const existingEmail = await userModel.getUserByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ status: 409, code: "EMAIL_ALREADY_EXISTS", message: null, data: null });
    }

    const existingNickname = await userModel.getUserByNickname(nickname);
    if (existingNickname) {
      return res.status(409).json({ status: 409, code: "NICKNAME_ALREADY_EXISTS", message: null, data: null });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await userModel.createUser(email, hashedPassword, nickname);

    return res.status(201).json({
      status: 201,
      code: "SIGNUP_SUCCESS",
      message: null,
      data: {
        userId: newUser.id,
        email: newUser.email,
        nickname: newUser.nickname,
        createdAt: newUser.created_at
      }
    });

  } catch (error) {
    console.error('Error in POST /api/auth/signup:', error);
    res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
  }
});

// POST /api/auth/login - 로그인
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ status: 400, code: "REQUIRED_EMAIL", message: null, data: null });
    }
    if (!password) {
      return res.status(400).json({ status: 400, code: "REQUIRED_PASSWORD", message: null, data: null });
    }

    const user = await userModel.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: null, data: null });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: null, data: null });
    }

    // 세션에 사용자 정보 저장
    req.session.userId = user.id;

    return res.status(200).json({
      status: 200,
      code: "LOGIN_SUCCESS",
      message: null,
      data: {
        userId: user.id,
        email: user.email,
        nickname: user.nickname
      }
    });

  } catch (error) {
    console.error('Error in POST /api/auth/login:', error);
    res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
  }
});

// POST /api/auth/logout - 로그아웃
router.post('/logout', requireLogin, async (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error in POST /api/auth/logout:', err);
      return res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
    }
    
    return res.status(200).json({
      status: 200,
      code: "LOGOUT_SUCCESS",
      message: null,
      data: null
    });
  });
});

// GET /api/auth/me - 내 정보 조회
router.get('/me', requireLogin, async (req, res) => {
  try {
    const userId = req.session.userId;
    const user = await userModel.getUserById(userId);

    if (!user) {
      return res.status(401).json({ status: 401, code: "UNAUTHORIZED", message: null, data: null });
    }

    return res.status(200).json({
      status: 200,
      code: "SESSION_VALID",
      message: null,
      data: {
        userId: user.id,
        email: user.email,
        nickname: user.nickname
      }
    });
  } catch (error) {
    console.error('Error in GET /api/auth/me:', error);
    res.status(500).json({ status: 500, code: "INTERNAL_SERVER_ERROR", message: null, data: null });
  }
});

module.exports = router;
