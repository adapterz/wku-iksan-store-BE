const inquiryModel = require('../db/models/inquiryModel');
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

// PATCH /api/admin/inquiries/:id — { adminReply } 답변 등록(상태는 자동으로 answered).
//
// TODO(#90 8-1절): category가 sanction_appeal인 문의를 승인 처리할 때는
// PATCH /api/admin/sanctions/:id(PR #99, db/models/sanctionModel.js)를 같은
// 트랜잭션에서 함께 호출해 정지를 조기 해제해야 한다. PR #99가 develop에 아직
// 머지되지 않아 sanctionModel이 없으므로, 이 연동은 PR #99 머지 후 별도로 붙인다.
// 지금은 답변 등록/상태 변경까지만 처리한다.
async function answerInquiry(req, res) {
  const inquiryId = parsePositiveInteger(req.params.id, { allowString: true });
  if (inquiryId === null) return sendError(res, ERROR.INVALID_INQUIRY_ID);

  const bodyValidation = validateInquiryReplyInput(req.body);
  if (bodyValidation.errorCode) return sendError(res, ERROR[bodyValidation.errorCode]);

  try {
    const inquiry = await inquiryModel.getInquiryById(inquiryId);
    if (!inquiry) return sendError(res, ERROR.INQUIRY_NOT_FOUND);

    const updated = await inquiryModel.answerInquiry(inquiryId, bodyValidation.value.adminReply);
    return sendSuccess(res, { ...SUCCESS.ADMIN_INQUIRY_UPDATE_SUCCESS, data: mapInquiry(updated) });
  } catch (error) {
    console.error('Error in PATCH /api/admin/inquiries/:id:', error);
    return sendError(res);
  }
}

module.exports = { getInquiries, answerInquiry };
