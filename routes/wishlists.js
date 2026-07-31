const express = require('express');
const router = express.Router();
const wishlistsController = require('../controllers/wishlistsController');

// M3 설계 승인 후 실제 찜 등록 로직과 로그인 검사를 추가한다.
router.post('/', wishlistsController.createWishlist);

// M3 설계 승인 후 실제 찜 해제 로직과 로그인 검사를 추가한다.
router.delete('/:productId', wishlistsController.removeWishlist);

// M3 설계 승인 후 실제 회원별 찜 목록 조회 로직과 로그인 검사를 추가한다.
router.get('/', wishlistsController.getWishlists);

module.exports = router;
