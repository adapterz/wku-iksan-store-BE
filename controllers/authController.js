const userModel = require('../db/models/userModel');
const bcrypt = require('bcrypt');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { SESSION_COOKIE_NAME, getSessionCookieOptions } = require('../constants/session');
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

// 로그인 전 세션을 폐기하고 새 세션 ID를 발급한다.
function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

// 새 세션이 저장된 뒤에만 로그인 성공 응답을 반환하도록 저장 완료를 기다린다.
function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

// POST /api/auth/signup - 회원가입
async function signup(req, res) {
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
}

// POST /api/auth/login - 로그인
async function login(req, res) {
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

    // 로그인 전후 세션 ID를 교체해 기존 세션이 인증 세션으로 이어지지 않도록 한다.
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

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
}

// POST /api/auth/logout - 로그아웃
async function logout(req, res) {
  try {
    await destroySession(req);
    res.clearCookie(
      SESSION_COOKIE_NAME,
      getSessionCookieOptions(process.env.NODE_ENV === 'production')
    );
    return sendSuccess(res, SUCCESS.LOGOUT_SUCCESS);
  } catch (error) {
    console.error('Error in POST /api/auth/logout:', error);
    return sendError(res);
  }
}

// GET /api/auth/me - 내 정보 조회
async function me(req, res) {
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
        nickname: user.nickname,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error in GET /api/auth/me:', error);
    return sendError(res);
  }
}

module.exports = {
  signup,
  login,
  logout,
  me
};
