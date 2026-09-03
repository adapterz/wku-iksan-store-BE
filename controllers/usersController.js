const bcrypt = require('bcrypt');
const userModel = require('../db/models/userModel');
const giftModel = require('../db/models/giftModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { SESSION_COOKIE_NAME, getSessionCookieOptions } = require('../constants/session');
const {
  validateEmail,
  validateSignupPassword,
  validateLoginPassword,
  validateNickname
} = require('../validators/authValidator');

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

// GET /api/users/search?nickname={nickname}
async function searchUser(req, res) {
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
}

// PATCH /api/users/me/email
async function updateEmail(req, res) {
  try {
    const userId = req.session.userId;
    const { email, password } = req.body || {};

    const emailValidation = validateEmail(email);
    if (emailValidation.errorCode) {
      return sendError(res, ERROR[emailValidation.errorCode]);
    }

    const passwordValidation = validateLoginPassword(password);
    if (passwordValidation.errorCode) {
      return sendError(res, ERROR[passwordValidation.errorCode]);
    }

    const user = await userModel.getUserById(userId);
    if (!user) {
      return sendError(res, ERROR.UNAUTHORIZED);
    }

    const isMatch = await bcrypt.compare(passwordValidation.value, user.password);
    if (!isMatch) {
      return sendError(res, ERROR.INVALID_PASSWORD);
    }

    const existingEmail = await userModel.getUserByEmail(emailValidation.value);
    if (existingEmail && existingEmail.id !== userId) {
      return sendError(res, ERROR.EMAIL_ALREADY_EXISTS);
    }

    const updatedUser = await userModel.updateUserEmail(userId, emailValidation.value);

    return sendSuccess(res, {
      ...SUCCESS.EMAIL_UPDATE_SUCCESS,
      data: {
        userId: updatedUser.id,
        email: updatedUser.email
      }
    });

  } catch (error) {
    console.error('Error in PATCH /api/users/me/email:', error);

    // 중복 확인과 UPDATE 사이의 경합으로 유니크 제약을 위반한 경우도 409로 응답한다.
    if (error.code === 'ER_DUP_ENTRY') {
      return sendError(res, ERROR.EMAIL_ALREADY_EXISTS);
    }

    return sendError(res);
  }
}

// PATCH /api/users/me/password
async function updatePassword(req, res) {
  try {
    const userId = req.session.userId;
    const { currentPassword, newPassword } = req.body || {};

    const currentPasswordValidation = validateLoginPassword(currentPassword);
    if (currentPasswordValidation.errorCode) {
      return sendError(res, ERROR[currentPasswordValidation.errorCode]);
    }

    const newPasswordValidation = validateSignupPassword(newPassword);
    if (newPasswordValidation.errorCode) {
      return sendError(res, ERROR[newPasswordValidation.errorCode]);
    }

    const user = await userModel.getUserById(userId);
    if (!user) {
      return sendError(res, ERROR.UNAUTHORIZED);
    }

    const isMatch = await bcrypt.compare(currentPasswordValidation.value, user.password);
    if (!isMatch) {
      return sendError(res, ERROR.INVALID_PASSWORD);
    }

    const hashedPassword = await bcrypt.hash(newPasswordValidation.value, 10);
    await userModel.updateUserPassword(userId, hashedPassword);

    return sendSuccess(res, SUCCESS.PASSWORD_UPDATE_SUCCESS);

  } catch (error) {
    console.error('Error in PATCH /api/users/me/password:', error);
    return sendError(res);
  }
}

// DELETE /api/users/me — 계정 하드 삭제.
// orders/wishlists의 FK ON DELETE 정책(SET NULL/CASCADE)이 연관 데이터를 정리하고,
// orders에는 삭제 시점의 발신자/수신자 닉네임 스냅샷이 남아있어 주문 이력은 보존된다.
// 다만 삭제되면 계정으로 로그인할 방법이 없어져 미사용 선물은 영구히 사용할 수 없게
// 되므로, 본인이 수신자인 미사용 선물이 남아있으면 삭제 자체를 거부한다.
async function deleteAccount(req, res) {
  try {
    const userId = req.session.userId;
    const { password } = req.body || {};

    const passwordValidation = validateLoginPassword(password);
    if (passwordValidation.errorCode) {
      return sendError(res, ERROR[passwordValidation.errorCode]);
    }

    const user = await userModel.getUserById(userId);
    if (!user) {
      return sendError(res, ERROR.UNAUTHORIZED);
    }

    const isMatch = await bcrypt.compare(passwordValidation.value, user.password);
    if (!isMatch) {
      return sendError(res, ERROR.INVALID_PASSWORD);
    }

    const unusedGifts = await giftModel.getGiftsByReceiverId(userId, 'unused');
    if (unusedGifts.length > 0) {
      return sendError(res, ERROR.ACCOUNT_HAS_UNUSED_GIFTS);
    }

    await userModel.deleteUser(userId);

    // 계정 삭제는 이미 끝났으므로, 서버 세션 삭제 실패가 계정 삭제 실패로 보이지 않게 한다.
    try {
      await destroySession(req);
    } catch (sessionError) {
      console.error('Session cleanup failed after account deletion:', sessionError);
    }

    // 서버 세션 삭제에 실패해도 브라우저가 기존 세션 쿠키를 다시 보내지 않도록
    // 쿠키 제거는 별도로 시도한다.
    try {
      res.clearCookie(
        SESSION_COOKIE_NAME,
        getSessionCookieOptions(process.env.NODE_ENV === 'production')
      );
    } catch (cookieError) {
      console.error('Session cookie cleanup failed after account deletion:', cookieError);
    }

    return sendSuccess(res, SUCCESS.ACCOUNT_DELETE_SUCCESS);

  } catch (error) {
    console.error('Error in DELETE /api/users/me:', error);
    return sendError(res);
  }
}

module.exports = {
  searchUser,
  updateEmail,
  updatePassword,
  deleteAccount
};
