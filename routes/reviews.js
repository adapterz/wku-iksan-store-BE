const router = require('express').Router();
const controller = require('../controllers/reviewsController');
const requireLogin = require('../middlewares/requireLogin');
const reviewCache = require('../middlewares/reviewCache');

router.use(reviewCache);
router.use(requireLogin);
router.post('/', controller.createReview);
router.get('/me', controller.getMyReviews);
router.get('/:id', controller.getReviewDetail);
router.patch('/:id', controller.updateReview);
router.delete('/:id', controller.deleteReview);

module.exports = router;
