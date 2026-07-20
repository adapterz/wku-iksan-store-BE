const express = require('express');
const router = express.Router();
const productModel = require('../db/models/productModel');

// 상품 목록 조회
router.get('/', async (req, res) => {
  try {
    const rows = await productModel.getAllProducts();

    const products = rows.map(row => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      price: row.price,
      thumbnailUrl: row.thumbnail_url
    }));

    res.status(200).json({
      status: 200,
      code: "PRODUCT_LIST_SUCCESS",
      message: null,
      data: products
    });
  } catch (error) {
    console.error('Database query error (GET /api/products):', error);
    res.status(500).json({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: null,
      data: null
    });
  }
});

// M2 1단계: 상품 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 실제 로직: DB 접근 계층(모듈)을 통해 데이터 조회
    const product = await productModel.getProductById(id);

    if (!product) {
      return res.status(404).json({
        status: 404,
        code: "PRODUCT_NOT_FOUND",
        message: null,
        data: null
      });
    }

    // DB 필드 -> API 응답 필드 변환 계층.
    // 실제 쿼리로 교체 시 이 매핑 로직은 유지하고 모델 내부 쿼리만 교체하면 됨
    res.status(200).json({
      status: 200,
      code: "PRODUCT_DETAIL_SUCCESS",
      message: null,
      data: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        thumbnailUrl: product.thumbnail_url,
        description: product.description,
        usageInfo: product.usage_info
      }
    });

  } catch (error) {
    console.error('Error in GET /api/products/:id:', error);
    res.status(500).json({
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message: null,
      data: null
    });
  }
});

module.exports = router;
