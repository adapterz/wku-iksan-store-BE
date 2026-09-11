const dashboardModel = require('../db/models/dashboardModel');
const reportModel = require('../db/models/reportModel');
const inquiryModel = require('../db/models/inquiryModel');
const { SUCCESS } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

// GET /api/admin/dashboard — 관리자가 매일 보는 요약 화면. "지금 처리해야 할 것"
// (pendingActions)과 "전체 현황"(products)을 나눠서 보여준다. 상세 목록이 필요하면
// 각 기능의 기존 API(GET /api/admin/reports, GET /api/admin/inquiries)로 이동한다.
//
// 문의 대기 건수(inquiryCount)가 없으면, 관리자가 대시보드만 보고 하루를 시작할 때
// 새로 들어온 이의제기 문의를 놓칠 수 있다(실제로 정지 이의제기 문의를 등록해도
// 대시보드에는 아무 신호가 없는 것을 확인 후 반영).
async function getDashboard(req, res) {
  try {
    const [products, pendingReports, pendingInquiries, activeSuspensionCount] = await Promise.all([
      dashboardModel.getProductStats(),
      reportModel.getReports({ status: 'pending', page: 1, limit: 1 }),
      inquiryModel.getInquiries({ status: 'pending', page: 1, limit: 1 }),
      dashboardModel.countActiveSuspensions()
    ]);

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_DASHBOARD_SUCCESS,
      data: {
        pendingActions: {
          reportCount: pendingReports.totalCount,
          inquiryCount: pendingInquiries.totalCount,
          activeSuspensionCount
        },
        products
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/dashboard:', error);
    return sendError(res);
  }
}

module.exports = { getDashboard };
