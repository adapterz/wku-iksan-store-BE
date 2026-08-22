// 모든 API 응답을 status, code, message, data 구조로 통일한다.
function sendResponse(res, { status, code, message = null, data = null, meta = null }) {
  const body = {
    status,
    code,
    message,
    data
  };

  // 목록 계산 시각처럼 응답에 필요한 부가 정보가 있을 때만 meta를 추가한다.
  if (meta !== null) {
    body.meta = meta;
  }

  return res.status(status).json(body);
}

// 성공 응답을 생성한다. 별도 status가 없으면 HTTP 200을 사용한다.
function sendSuccess(res, { status = 200, code, message = null, data = null, meta = null }) {
  return sendResponse(res, { status, code, message, data, meta });
}

// 403, 404 같은 오류 응답을 생성하며, 인자가 없으면 공통 500 오류를 반환한다.
function sendError(res, {
  status = 500,
  code = 'INTERNAL_SERVER_ERROR',
  message = null,
  data = null
} = {}) {
  return sendResponse(res, { status, code, message, data });
}

module.exports = {
  sendSuccess,
  sendError
};
