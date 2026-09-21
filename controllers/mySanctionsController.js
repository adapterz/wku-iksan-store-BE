const sanctionModel = require('../db/models/sanctionModel');
const { validateSanctionListQuery, validateSanctionNotificationInput } = require('../validators/sanctionValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

function mapSanction(row) {
  return {
    sanctionId: row.id,
    type: row.type,
    reason: row.reason,
    endsAt: row.ends_at,
    status: row.status,
    createdAt: row.created_at
  };
}

function meta({ page, limit }, totalCount) {
  return { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) };
}

// GET /api/users/me/sanctions?page=&limit= — 알림함 본문. 경고·정지 이력을 그대로
// 보여준다(admin용 getUserSanctions와 동일한 모델을 본인 조회로 재사용).
async function getMySanctions(req, res) {
  const query = validateSanctionListQuery(req.query);
  if (query.errorCode) return sendError(res, ERROR[query.errorCode]);

  try {
    const result = await sanctionModel.getUserSanctions(req.session.userId, query.value);
    return sendSuccess(res, {
      ...SUCCESS.MY_SANCTION_LIST_SUCCESS,
      data: result.rows.map(mapSanction),
      meta: meta(query.value, result.totalCount)
    });
  } catch (error) {
    console.error('Error in GET /api/users/me/sanctions:', error);
    return sendError(res);
  }
}

// GET /api/users/me/sanctions/unnotified — 최초 로그인 후 토스트를 띄울지 FE가
// 판단하는 용도. 조회 자체는 확인 시각을 바꾸지 않는다.
async function getUnnotifiedSanctions(req, res) {
  try {
    const sanctionIds = await sanctionModel.getUnnotifiedWarningIds(req.session.userId);
    return sendSuccess(res, {
      ...SUCCESS.SANCTION_UNNOTIFIED_SUCCESS,
      data: { count: sanctionIds.length, sanctionIds }
    });
  } catch (error) {
    console.error('Error in GET /api/users/me/sanctions/unnotified:', error);
    return sendError(res);
  }
}

// PATCH /api/users/me/sanctions/notify — 토스트 확인 처리.
async function notifySanctions(req, res) {
  const validation = validateSanctionNotificationInput(req.body);
  if (validation.errorCode) return sendError(res, ERROR[validation.errorCode]);

  try {
    const sanctionIds = validation.value;
    const accepted = await sanctionModel.notifySanctions(req.session.userId, sanctionIds);
    if (!accepted) return sendError(res, ERROR.SANCTION_NOTIFICATION_TARGET_NOT_FOUND);
    // 신규 갱신 건수가 아닌 확인 완료된 요청 대상 수: 동일 재시도에도 같은 응답.
    return sendSuccess(res, {
      ...SUCCESS.SANCTION_NOTIFY_SUCCESS,
      data: { count: sanctionIds.length, sanctionIds }
    });
  } catch (error) {
    console.error('Error in PATCH /api/users/me/sanctions/notify:', error);
    return sendError(res);
  }
}

module.exports = { getMySanctions, getUnnotifiedSanctions, notifySanctions };
