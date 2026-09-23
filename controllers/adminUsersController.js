const userModel = require('../db/models/userModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateRole } = require('../validators/adminUserValidator');
const { validateNickname } = require('../validators/authValidator');

// PATCH /api/admin/users/:id/role — 관리자 승격/강등.
// 자기 자신을 강등하는 것은 막는다(마지막 관리자가 실수로 스스로 권한을
// 없애버려 아무도 관리자 기능에 못 들어가는 상황을 방지하기 위함, 이슈 #90 3-3절).
// 자기 자신을 다시 승격하는 것도 막는다(이미 관리자인 호출자라 항상 no-op인데,
// "승격 완료" 성공 토스트가 떠서 혼동을 준다, #138 2-1).
async function updateUserRole(req, res) {
  try {
    const targetUserId = parsePositiveInteger(req.params.id, { allowString: true });
    if (targetUserId === null) {
      return sendError(res, ERROR.INVALID_USER_ID);
    }

    const { role } = req.body || {};
    const roleValidation = validateRole(role);
    if (roleValidation.errorCode) {
      return sendError(res, ERROR[roleValidation.errorCode]);
    }

    if (targetUserId === req.session.userId) {
      if (roleValidation.value !== 'admin') {
        return sendError(res, ERROR.CANNOT_DEMOTE_SELF);
      }
      return sendError(res, ERROR.CANNOT_PROMOTE_SELF);
    }

    const targetUser = await userModel.getUserById(targetUserId);
    if (!targetUser) {
      return sendError(res, ERROR.USER_NOT_FOUND);
    }

    const updatedUser = await userModel.updateUserRole(targetUserId, roleValidation.value);

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_ROLE_UPDATE_SUCCESS,
      data: {
        userId: updatedUser.id,
        role: updatedUser.role
      }
    });

  } catch (error) {
    console.error('Error in PATCH /api/admin/users/:id/role:', error);
    return sendError(res);
  }
}

// GET /api/admin/users?nickname={nickname} — 제재/권한 관리 화면에서 대상 계정을 확인하기 위한 조회.
// 닉네임은 uq_users_nickname UNIQUE 제약으로 유일성이 보장되므로 단건 조회 키로 충분하다.
// 이메일 등 그 외 개인정보는 이 응답에 포함하지 않는다(이슈 #97 BE-2).
async function searchUserByNickname(req, res) {
  try {
    const nicknameValidation = validateNickname(req.query.nickname);
    if (nicknameValidation.errorCode) {
      return sendError(res, ERROR[nicknameValidation.errorCode]);
    }

    const user = await userModel.getUserByNickname(nicknameValidation.value);
    if (!user) {
      return sendError(res, ERROR.USER_NOT_FOUND);
    }

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_USER_LOOKUP_SUCCESS,
      data: {
        userId: user.id,
        nickname: user.nickname,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error in GET /api/admin/users:', error);
    return sendError(res);
  }
}

module.exports = {
  updateUserRole,
  searchUserByNickname
};
