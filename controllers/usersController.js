const bcrypt = require('bcrypt');
const pool = require('../db/pool');
const userModel = require('../db/models/userModel');
const giftModel = require('../db/models/giftModel');
const sanctionModel = require('../db/models/sanctionModel');
// 계정 삭제 시 wishlists.user_id의 ON DELETE CASCADE로 해당 유저의 찜이 DB 레벨에서
// 자동 삭제되는데, 이 경로는 wishlistsController를 거치지 않아 상품 목록 캐시의
// wishlistCount가 갱신되지 않는다. 그래서 여기서도 별도로 무효화해야 한다.
const { invalidateProductListCache } = require('./productsController');
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

// PATCH /api/users/me/nickname — 비밀번호 재확인 없이 세션만으로 변경한다.
async function updateNickname(req, res) {
  try {
    const userId = req.session.userId;
    const { nickname } = req.body || {};

    const nicknameValidation = validateNickname(nickname);
    if (nicknameValidation.errorCode) {
      return sendError(res, ERROR[nicknameValidation.errorCode]);
    }

    const user = await userModel.getUserById(userId);
    if (!user) {
      return sendError(res, ERROR.UNAUTHORIZED);
    }

    const existingNickname = await userModel.getUserByNickname(nicknameValidation.value);
    if (existingNickname && existingNickname.id !== userId) {
      return sendError(res, ERROR.NICKNAME_ALREADY_EXISTS);
    }

    const updatedUser = await userModel.updateUserNickname(userId, nicknameValidation.value);

    return sendSuccess(res, {
      ...SUCCESS.NICKNAME_UPDATE_SUCCESS,
      data: {
        userId: updatedUser.id,
        nickname: updatedUser.nickname
      }
    });

  } catch (error) {
    console.error('Error in PATCH /api/users/me/nickname:', error);

    // 중복 확인과 UPDATE 사이의 경합으로 유니크 제약을 위반한 경우도 409로 응답한다.
    if (error.code === 'ER_DUP_ENTRY') {
      return sendError(res, ERROR.NICKNAME_ALREADY_EXISTS);
    }

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

// "활성 정지 확인 → 계정 삭제" 사이에 새 정지가 끼어드는 경합을 막기 위해, 유저 행을
// 잠그고(FOR UPDATE) 재확인한 뒤 삭제까지 같은 트랜잭션에서 처리한다. sanctionModel.
// createSanction도 정지/경고 등록 전에 동일하게 유저 행을 먼저 잠그므로, 두 트랜잭션이
// 같은 유저 행 잠금을 두고 경쟁하면서 순서대로 처리된다 — 한쪽이 정지를 부여하면 다른
// 쪽은 그 커밋 이후에야 재확인하게 되어 회피할 수 없다. 활성 정지가 있으면 커밋할 것이
// 없으므로 롤백만 하고 삭제 여부를 false로 반환한다.
async function deleteUserIfNoActiveSanction(userId) {
  const connection = await pool.getConnection();
  let started = false;
  try {
    await connection.beginTransaction();
    started = true;
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);

    const activeSuspension = await sanctionModel.getActiveSuspension(userId, connection);
    if (activeSuspension) {
      await connection.rollback();
      return { deleted: false };
    }

    await userModel.deleteUser(userId, connection);
    await connection.commit();
    return { deleted: true };
  } catch (error) {
    if (started) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error('Account delete rollback failed:', { code: rollbackError.code });
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

// DELETE /api/users/me — 계정 하드 삭제.
// orders/wishlists의 FK ON DELETE 정책(SET NULL/CASCADE)이 연관 데이터를 정리하고,
// orders에는 삭제 시점의 발신자/수신자 닉네임 스냅샷이 남아있어 주문 이력은 보존된다.
// 다만 삭제되면 계정으로 로그인할 방법이 없어져 미사용 선물은 영구히 사용할 수 없게
// 되므로, 본인이 수신자인 미사용 선물이 남아있으면 삭제 자체를 거부한다.
//
// user_sanctions.user_id가 ON DELETE CASCADE라 계정을 삭제하면 제재 기록도 함께
// 사라진다. 그대로 두면 정지당한 유저가 탈퇴 후 같은 이메일로 재가입해 제재 이력 없이
// 다시 활동할 수 있어(신고당한 리뷰를 작성자가 직접 삭제해 증거를 없애는 것과 동일한
// 회피 패턴), 활성 정지가 있으면 삭제 자체를 거부한다(이슈 #90 7-5절). 경고만 있고
// 활성 정지가 없는 경우는 막지 않는다 — 경고는 아무 기능도 제한하지 않으므로, 경고
// 이력만으로 탈퇴 자체를 막으면 배보다 배꼽이 커진다.
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

    const { deleted } = await deleteUserIfNoActiveSanction(userId);
    if (!deleted) {
      return sendError(res, ERROR.ACCOUNT_HAS_ACTIVE_SANCTION);
    }
    await invalidateProductListCache();

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
  updateNickname,
  updateEmail,
  updatePassword,
  deleteAccount
};
