const userModel = require('../db/models/userModel');
const sanctionModel = require('../db/models/sanctionModel');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateSanctionCreateInput, validateSanctionListQuery } = require('../validators/sanctionValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

function mapSanction(row) {
  return {
    sanctionId: row.id,
    userId: row.user_id,
    type: row.type,
    reason: row.reason,
    issuedBy: row.issued_by,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at
  };
}

function meta({ page, limit }, totalCount) {
  return { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) };
}

// POST /api/admin/users/:id/sanctions
async function createSanction(req, res) {
  const userId = parsePositiveInteger(req.params.id, { allowString: true });
  if (userId === null) return sendError(res, ERROR.INVALID_USER_ID);

  const bodyValidation = validateSanctionCreateInput(req.body);
  if (bodyValidation.errorCode) return sendError(res, ERROR[bodyValidation.errorCode]);

  try {
    const targetUser = await userModel.getUserById(userId);
    if (!targetUser) return sendError(res, ERROR.USER_NOT_FOUND);

    const sanction = await sanctionModel.createSanction(userId, req.session.userId, bodyValidation.value);

    return sendSuccess(res, { ...SUCCESS.ADMIN_SANCTION_CREATE_SUCCESS, data: mapSanction(sanction) });
  } catch (error) {
    if (error.sanctionError && ERROR[error.sanctionError]) return sendError(res, ERROR[error.sanctionError]);
    console.error('Error in POST /api/admin/users/:id/sanctions:', error);
    return sendError(res);
  }
}

// GET /api/admin/users/:id/sanctions?page=&limit=
async function getUserSanctions(req, res) {
  const userId = parsePositiveInteger(req.params.id, { allowString: true });
  if (userId === null) return sendError(res, ERROR.INVALID_USER_ID);

  const query = validateSanctionListQuery(req.query);
  if (query.errorCode) return sendError(res, ERROR[query.errorCode]);

  try {
    const targetUser = await userModel.getUserById(userId);
    if (!targetUser) return sendError(res, ERROR.USER_NOT_FOUND);

    const result = await sanctionModel.getUserSanctions(userId, query.value);
    return sendSuccess(res, {
      ...SUCCESS.ADMIN_SANCTION_LIST_SUCCESS,
      data: result.rows.map(mapSanction),
      meta: meta(query.value, result.totalCount)
    });
  } catch (error) {
    console.error('Error in GET /api/admin/users/:id/sanctions:', error);
    return sendError(res);
  }
}

// PATCH /api/admin/sanctions/:id — 조기 해제(이의제기 승인 등으로 status를 lifted로)
async function liftSanction(req, res) {
  const sanctionId = parsePositiveInteger(req.params.id, { allowString: true });
  if (sanctionId === null) return sendError(res, ERROR.INVALID_SANCTION_ID);

  try {
    const sanction = await sanctionModel.liftSanction(sanctionId);
    if (!sanction) return sendError(res, ERROR.SANCTION_NOT_FOUND);

    return sendSuccess(res, { ...SUCCESS.ADMIN_SANCTION_LIFT_SUCCESS, data: mapSanction(sanction) });
  } catch (error) {
    console.error('Error in PATCH /api/admin/sanctions/:id:', error);
    return sendError(res);
  }
}

module.exports = { createSanction, getUserSanctions, liftSanction };
