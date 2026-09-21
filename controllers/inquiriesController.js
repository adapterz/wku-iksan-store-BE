const inquiryModel = require('../db/models/inquiryModel');
const { validateInquiryCreateInput, validateInquiryListQuery } = require('../validators/inquiryValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

function mapInquiry(row) {
  return {
    inquiryId: row.id,
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

// POST /api/inquiries
async function createInquiry(req, res) {
  const bodyValidation = validateInquiryCreateInput(req.body);
  if (bodyValidation.errorCode) return sendError(res, ERROR[bodyValidation.errorCode]);

  try {
    const inquiry = await inquiryModel.createInquiry(req.session.userId, bodyValidation.value);
    return sendSuccess(res, { ...SUCCESS.INQUIRY_CREATE_SUCCESS, data: mapInquiry(inquiry) });
  } catch (error) {
    console.error('Error in POST /api/inquiries:', error);
    return sendError(res);
  }
}

// GET /api/inquiries/me?page=&limit=
async function getMyInquiries(req, res) {
  const query = validateInquiryListQuery(req.query, { mine: true });
  if (query.errorCode) return sendError(res, ERROR[query.errorCode]);

  try {
    const result = await inquiryModel.getMyInquiries(req.session.userId, query.value);
    return sendSuccess(res, {
      ...SUCCESS.MY_INQUIRY_LIST_SUCCESS,
      data: result.rows.map(mapInquiry),
      meta: meta(query.value, result.totalCount)
    });
  } catch (error) {
    console.error('Error in GET /api/inquiries/me:', error);
    return sendError(res);
  }
}

module.exports = { createInquiry, getMyInquiries };
