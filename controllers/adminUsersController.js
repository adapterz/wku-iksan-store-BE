const userModel = require('../db/models/userModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateRole } = require('../validators/adminUserValidator');

// PATCH /api/admin/users/:id/role — 관리자 승격/강등.
// 자기 자신을 강등하는 것은 막는다(마지막 관리자가 실수로 스스로 권한을
// 없애버려 아무도 관리자 기능에 못 들어가는 상황을 방지하기 위함, 이슈 #90 3-3절).
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

    if (targetUserId === req.session.userId && roleValidation.value !== 'admin') {
      return sendError(res, ERROR.CANNOT_DEMOTE_SELF);
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

module.exports = {
  updateUserRole
};
