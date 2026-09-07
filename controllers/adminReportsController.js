const pool = require('../db/pool');
const reportModel = require('../db/models/reportModel');
const reviewModel = require('../db/models/reviewModel');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateReportListQuery, validateReportStatusBody } = require('../validators/reportValidator');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

function mapReport(row) {
  return {
    reportId: row.id,
    reviewId: row.review_id,
    reporterId: row.reporter_id,
    reviewContentSnapshot: row.review_content_snapshot,
    reviewRatingSnapshot: row.review_rating_snapshot,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at
  };
}

function meta({ page, limit }, totalCount) {
  return { page, limit, totalCount, totalPages: Math.ceil(totalCount / limit) };
}

// GET /api/admin/reports?status=pending&page=1&limit=10
async function getReports(req, res) {
  const query = validateReportListQuery(req.query);
  if (query.errorCode) return sendError(res, ERROR[query.errorCode]);

  try {
    const result = await reportModel.getReports(query.value);
    return sendSuccess(res, {
      ...SUCCESS.ADMIN_REPORT_LIST_SUCCESS,
      data: result.rows.map(mapReport),
      meta: meta(query.value, result.totalCount)
    });
  } catch (error) {
    console.error('Error in GET /api/admin/reports:', error);
    return sendError(res);
  }
}

// 리뷰 숨김과 신고 상태 변경을 하나의 트랜잭션으로 묶는다. 따로 커밋하면 두 번째
// 저장이 실패했을 때 리뷰는 이미 숨겨졌는데 신고는 pending으로 남는 상태가 될 수 있다.
async function actionReport(reportId, reviewId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    if (reviewId !== null) {
      try {
        await reviewModel.updateReviewStatus(reviewId, 'hidden', connection);
      } catch (error) {
        // 조회와 처리 사이에 작성자가 리뷰를 직접 삭제한 드문 경우: FK가 SET NULL이라
        // 정상적으로는 report.review_id가 이미 null이었겠지만, 그 갱신과 겹치면 여기서
        // REVIEW_NOT_FOUND를 받을 수 있다. 이미 사라진 리뷰는 숨길 필요가 없으니 신고
        // 처리 자체는 계속 진행한다.
        if (error.reviewError !== 'REVIEW_NOT_FOUND') throw error;
      }
    }

    const updated = await reportModel.updateReportStatus(reportId, 'actioned', connection);
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// PATCH /api/admin/reports/:id — { status: 'dismissed' | 'actioned' }
// actioned로 처리하면 신고 대상 리뷰를 숨김 처리하는 기존 모더레이션 로직을 그대로 재사용한다.
async function updateReportStatus(req, res) {
  const reportId = parsePositiveInteger(req.params.id, { allowString: true });
  if (reportId === null) return sendError(res, ERROR.INVALID_REPORT_ID);

  const bodyValidation = validateReportStatusBody(req.body);
  if (bodyValidation.errorCode) return sendError(res, ERROR[bodyValidation.errorCode]);

  try {
    const report = await reportModel.getReportById(reportId);
    if (!report) return sendError(res, ERROR.REPORT_NOT_FOUND);

    const updated = bodyValidation.value.status === 'actioned'
      ? await actionReport(reportId, report.review_id)
      : await reportModel.updateReportStatus(reportId, bodyValidation.value.status);

    return sendSuccess(res, { ...SUCCESS.ADMIN_REPORT_UPDATE_SUCCESS, data: mapReport(updated) });
  } catch (error) {
    console.error('Error in PATCH /api/admin/reports/:id:', error);
    return sendError(res);
  }
}

module.exports = { getReports, updateReportStatus };
