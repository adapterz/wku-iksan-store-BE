const express = require('express');
const router = express.Router();
const requireLogin = require('../../middlewares/requireLogin');
const requireAdmin = require('../../middlewares/requireAdmin');
const reviewModerationController = require('../../controllers/reviewModerationController');

// 신고 처리 등 관리자 모더레이션 전용. 컨트롤러/모델/검증은 리뷰 담당자(Ethan)가
// PR #91에서 준비해뒀고(docs/BE/REVIEWS.md 참고), 여기서는 관리자 인증 뒤에 연결만 한다.
router.patch('/:id/status', requireLogin, requireAdmin, reviewModerationController.updateReviewStatus);

module.exports = router;
