const express = require('express');
const router = express.Router();
const requireLogin = require('../middlewares/requireLogin');
const giftsController = require('../controllers/giftsController');

router.get('/', requireLogin, giftsController.getGifts);
router.get('/:id', requireLogin, giftsController.getGiftDetail);
router.patch('/:id/use', requireLogin, giftsController.useGift);

module.exports = router;
