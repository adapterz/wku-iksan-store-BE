const express = require('express');
const router = express.Router();
const { sendError } = require('./api');

const sendNotImplemented = (res) => sendError(res, {
  status: 501,
  code: 'NOT_IMPLEMENTED',
  message: '찜 API는 아직 구현되지 않았습니다.'
});

// M3 설계 승인 후 실제 찜 등록 로직과 로그인 검사를 추가한다.
router.post('/', (req, res) => sendNotImplemented(res));

// M3 설계 승인 후 실제 찜 해제 로직과 로그인 검사를 추가한다.
router.delete('/:productId', (req, res) => sendNotImplemented(res));

// M3 설계 승인 후 실제 회원별 찜 목록 조회 로직과 로그인 검사를 추가한다.
router.get('/', (req, res) => sendNotImplemented(res));

module.exports = router;
