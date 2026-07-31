const { sendError } = require('../routes/api');
const { ERROR } = require('../constants/responseCodes');

const sendNotImplemented = (res) => sendError(res, {
  ...ERROR.NOT_IMPLEMENTED,
  message: '찜 API는 아직 구현되지 않았습니다.'
});

// M3 설계 승인 후 실제 찜 등록 로직과 로그인 검사를 추가한다.
function createWishlist(req, res) {
  return sendNotImplemented(res);
}

// M3 설계 승인 후 실제 찜 해제 로직과 로그인 검사를 추가한다.
function removeWishlist(req, res) {
  return sendNotImplemented(res);
}

// M3 설계 승인 후 실제 회원별 찜 목록 조회 로직과 로그인 검사를 추가한다.
function getWishlists(req, res) {
  return sendNotImplemented(res);
}

module.exports = {
  createWishlist,
  removeWishlist,
  getWishlists
};
