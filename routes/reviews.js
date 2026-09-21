const router = require('express').Router();
const controller = require('../controllers/reviewsController');
const reportsController = require('../controllers/reportsController');
const requireLogin = require('../middlewares/requireLogin');
const reviewCache = require('../middlewares/reviewCache');
const limits = require('../middlewares/apiRateLimits');

router.use(reviewCache);
router.use(requireLogin);
router.post('/', controller.createReview);
router.get('/me', controller.getMyReviews);
router.get('/:id', controller.getReviewDetail);
router.patch('/:id', controller.updateReview);
router.delete('/:id', controller.deleteReview);
router.post('/:id/reports', limits.report, reportsController.createReport);

module.exports = router;
