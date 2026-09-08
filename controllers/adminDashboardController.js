const dashboardModel = require('../db/models/dashboardModel');
const reportModel = require('../db/models/reportModel');
const { SUCCESS } = require('../constants/responseCodes');
const { sendSuccess, sendError } = require('../routes/api');

// GET /api/admin/dashboard — 관리자가 매일 보는 요약 화면. "지금 처리해야 할 것"
// (pendingActions)과 "전체 현황"(products)을 나눠서 보여준다. 상세 목록이 필요하면
// 각 기능의 기존 API(GET /api/admin/reports, GET /api/admin/inquiries)로 이동한다.
//
// TODO(#90 5-1절): pendingActions에 문의 대기 건수(inquiryCount)도 넣어야 한다.
// PR #100(feature/inquiries)이 develop에 아직 머지되지 않아 db/models/inquiryModel.js가
// 없으므로, PR #100 머지 후 inquiryModel.getInquiries({status:'pending', page:1, limit:1})
// 결과의 totalCount를 reportCount와 같은 방식으로 추가한다.
async function getDashboard(req, res) {
  try {
    const [products, pendingReports, activeSuspensionCount] = await Promise.all([
      dashboardModel.getProductStats(),
      reportModel.getReports({ status: 'pending', page: 1, limit: 1 }),
      dashboardModel.countActiveSuspensions()
    ]);

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_DASHBOARD_SUCCESS,
      data: {
        pendingActions: {
          reportCount: pendingReports.totalCount,
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
