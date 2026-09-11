const router = require('express').Router();
const controller = require('../controllers/cartController');
router.use(require('../middlewares/reviewCache'));
router.use(require('../middlewares/requireLogin'));
router.post('/', controller.createGroup);
router.get('/:id', controller.getGroup);
module.exports = router;
