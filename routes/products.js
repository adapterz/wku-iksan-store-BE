const express = require('express');
const router = express.Router();
const productsController = require('../controllers/productsController');
const reviewsController = require('../controllers/reviewsController');
const reviewCache = require('../middlewares/reviewCache');
const limits = require('../middlewares/apiRateLimits');

router.get('/', limits.productSearch, productsController.getProducts);
// /:id보다 먼저 등록해야 'ranking'/'popular-keywords'가 상품 ID로 잘못 매칭되지 않는다.
router.get('/ranking', productsController.getProductRanking);
router.get('/popular-keywords', productsController.getPopularKeywords);
router.get('/:id/reviews', reviewCache, reviewsController.getProductReviews);
router.get('/:id', productsController.getProductDetail);

module.exports = router;
