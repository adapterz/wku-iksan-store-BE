const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const wishlistsController = require('../controllers/wishlistsController');

// 모든 찜 API는 로그인 사용자의 세션 ID를 기준으로 본인 데이터만 처리한다.
router.post('/', requireLogin, wishlistsController.createWishlist);
router.delete('/:productId', requireLogin, wishlistsController.removeWishlist);
router.get('/', requireLogin, wishlistsController.getWishlists);

module.exports = router;
