// 상품별 공개 목록도 isMine에 따라 개인화되므로 모든 리뷰 응답을 저장하지 않는다.
module.exports = function reviewCache(req, res, next) {
  res.set('Cache-Control', 'private, no-store');
  next();
};
