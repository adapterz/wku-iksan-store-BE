const express = require('express');
const router = express.Router();
const brandsController = require('../controllers/brandsController');

router.get('/', brandsController.getBrands);

module.exports = router;
