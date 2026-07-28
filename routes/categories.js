const express = require('express');
const router = express.Router();
const { sendError } = require('./api');

// M3 설계 승인 후 실제 카테고리 목록 조회 로직으로 교체한다.
router.get('/', (req, res) => {
  return sendError(res, {
    status: 501,
    code: 'NOT_IMPLEMENTED',
    message: '카테고리 목록 조회 API는 아직 구현되지 않았습니다.'
  });
});

module.exports = router;
