const pool = require('../db/pool');
const inquiryModel = require('../db/models/inquiryModel');
const sanctionModel = require('../db/models/sanctionModel');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateInquiryListQuery, validateInquiryReplyInput } = require('../validators/inquiryValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

function mapInquiry(row) {
  return {
    inquiryId: row.id,
    userId: row.user_id,
    category: row.category,
    content: row.content,
    adminReply: row.admin_reply,
    status: row.status,
    createdAt: row.created_at
  };
}

function meta({ page, limit }, totalCount) {
  return { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) };
}

// GET /api/admin/inquiries?status=pending&page=1&limit=10
async function getInquiries(req, res) {
  const query = validateInquiryListQuery(req.query);
  if (query.errorCode) return sendError(res, ERROR[query.errorCode]);

  try {
    const result = await inquiryModel.getInquiries(query.value);
    return sendSuccess(res, {
      ...SUCCESS.ADMIN_INQUIRY_LIST_SUCCESS,
      data: result.rows.map(mapInquiry),
      meta: meta(query.value, result.totalCount)
    });
  } catch (error) {
    console.error('Error in GET /api/admin/inquiries:', error);
    return sendError(res);
  }
}

// 정지 해제와 문의 답변 저장을 하나의 트랜잭션으로 묶는다. 따로 커밋하면 정지는
// 풀렸는데 답변 저장이 실패해 문의가 계속 미답변으로 남는 상태가 될 수 있다
// (adminReportsController.actionReport와 동일 패턴).
async function liftSanctionAndAnswerInquiry(inquiryId, adminReply, sanctionId, appealUserId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const sanction = await sanctionModel.getSanctionById(sanctionId, connection);
    // 존재하지 않는 sanctionId와 다른 유저의 sanctionId를 같은 에러로 처리해, 응답만으로
    // 다른 유저의 제재 존재 여부를 알아낼 수 없게 한다.
    if (!sanction || sanction.user_id !== appealUserId) {
      const error = new Error('SANCTION_NOT_FOUND');
      error.inquiryError = 'SANCTION_NOT_FOUND';
      throw error;
    }
    // warning은 status만 lifted로 바뀔 뿐 sanctionModel.countWarnings가 status를 보지
    // 않아 "경고 1회 제한"에는 계속 걸린다 — 이 API로 해제해도 실질 효과가 없다. 이슈
    // #90 8-1/7-4절도 정지(suspension) 해제만 다루므로 여기서 미리 막는다.
    if (sanction.type !== 'suspension') {
      const error = new Error('SANCTION_NOT_SUSPENSION');
      error.inquiryError = 'SANCTION_NOT_SUSPENSION';
      throw error;
    }
    await sanctionModel.liftSanction(sanctionId, connection);

    const updated = await inquiryModel.answerInquiry(inquiryId, adminReply, connection);
    // updated가 null이면(조회~처리 사이 문의가 사라진 극단적 레이스) 커밋하지 않고
    // 던져서 위 정지 해제까지 함께 롤백한다 — 안 그러면 정지는 풀렸는데 500이 나가는
    // 상태가 된다.
    if (!updated) {
      const error = new Error('INQUIRY_NOT_FOUND');
      error.inquiryError = 'INQUIRY_NOT_FOUND';
      throw error;
    }
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// PATCH /api/admin/inquiries/:id — { adminReply, sanctionId? } 답변 등록(상태는 자동으로
// answered). sanction_appeal 문의를 승인할 때 sanctionId를 함께 보내면, 답변 저장과 같은
// 트랜잭션에서 그 정지를 해제한다(이슈 #90 8-1절). sanctionId를 생략하면 답변만 등록한다
// (이의제기를 반려하는 경우 등).
async function answerInquiry(req, res) {
  const inquiryId = parsePositiveInteger(req.params.id, { allowString: true });
  if (inquiryId === null) return sendError(res, ERROR.INVALID_INQUIRY_ID);

  const bodyValidation = validateInquiryReplyInput(req.body);
  if (bodyValidation.errorCode) return sendError(res, ERROR[bodyValidation.errorCode]);

  try {
    const inquiry = await inquiryModel.getInquiryById(inquiryId);
    if (!inquiry) return sendError(res, ERROR.INQUIRY_NOT_FOUND);

    const { adminReply, sanctionId } = bodyValidation.value;
    if (sanctionId !== null && inquiry.category !== 'sanction_appeal') {
      return sendError(res, ERROR.SANCTION_ID_NOT_ALLOWED);
    }

    const updated = sanctionId !== null
      ? await liftSanctionAndAnswerInquiry(inquiryId, adminReply, sanctionId, inquiry.user_id)
      : await inquiryModel.answerInquiry(inquiryId, adminReply);
    if (!updated) return sendError(res, ERROR.INQUIRY_NOT_FOUND);

    return sendSuccess(res, { ...SUCCESS.ADMIN_INQUIRY_UPDATE_SUCCESS, data: mapInquiry(updated) });
  } catch (error) {
    if (error.inquiryError && ERROR[error.inquiryError]) return sendError(res, ERROR[error.inquiryError]);
    console.error('Error in PATCH /api/admin/inquiries/:id:', error);
    return sendError(res);
  }
}

module.exports = { getInquiries, answerInquiry };
