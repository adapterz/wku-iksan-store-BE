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

// 문의 행을 잠근 뒤(FOR UPDATE) 최신 상태를 다시 확인하고, 필요하면 정지 해제까지
// 같은 트랜잭션으로 묶어 처리한다. 잠금만 걸고 상태를 재확인하지 않으면 순서만
// 뒤로 밀릴 뿐, 뒤에 도착한 관리자의 요청이 앞서 처리된 결과를 그대로 덮어써버린다
// (같은 이의제기 문의를 두 관리자가 동시에 승인/반려하는 상황 — PR #100 리뷰 코멘트).
async function processInquiryAnswer(inquiryId, adminReply, sanctionId, appealUserId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const inquiry = await inquiryModel.lockInquiryById(inquiryId, connection);
    if (!inquiry) {
      const error = new Error('INQUIRY_NOT_FOUND');
      error.inquiryError = 'INQUIRY_NOT_FOUND';
      throw error;
    }
    // 이미 다른 관리자가 답변을 등록한 뒤라면: 완전히 같은 답변으로 재시도한 것이면
    // 멱등하게 통과시키고(아래 answerInquiry가 no-op으로 처리), 내용이 다른 결정이면
    // 충돌로 막아 클라이언트가 최신 상태를 다시 조회하게 한다.
    if (inquiry.status === 'answered' && inquiry.admin_reply !== adminReply) {
      const error = new Error('INQUIRY_ALREADY_PROCESSED');
      error.inquiryError = 'INQUIRY_ALREADY_PROCESSED';
      throw error;
    }

    if (sanctionId !== null) {
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
    }

    const updated = await inquiryModel.answerInquiry(inquiryId, adminReply, connection);
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

    const updated = await processInquiryAnswer(inquiryId, adminReply, sanctionId, inquiry.user_id);
    return sendSuccess(res, { ...SUCCESS.ADMIN_INQUIRY_UPDATE_SUCCESS, data: mapInquiry(updated) });
  } catch (error) {
    if (error.inquiryError && ERROR[error.inquiryError]) return sendError(res, ERROR[error.inquiryError]);
    console.error('Error in PATCH /api/admin/inquiries/:id:', error);
    return sendError(res);
  }
}

module.exports = { getInquiries, answerInquiry };
