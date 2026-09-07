const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const giftsController = require('../controllers/giftsController');
const reviewCache = require('../middlewares/reviewCache');

// canReview/reviewId 등 개인화된 선물 상태도 브라우저 캐시에 남기지 않는다.
router.use(reviewCache);

router.get('/', requireLogin, giftsController.getGifts);
router.get('/:id', requireLogin, giftsController.getGiftDetail);
router.patch('/:id/use', requireLogin, giftsController.useGift);

module.exports = router;
