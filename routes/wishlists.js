const express = require('express');
const router = express.Router();

// M3 설계 승인 후 아래 찜 API 핸들러를 추가한다.
// POST   /api/wishlists             찜 등록
// DELETE /api/wishlists/:productId  찜 해제
// GET    /api/wishlists             회원별 찜 목록 조회

module.exports = router;
