const productModel = require('../db/models/productModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { validateProductListQuery } = require('../validators/productValidator');

// 상품 목록 조회와 상품명·브랜드 검색, 카테고리 필터를 함께 처리한다.
async function getProducts(req, res) {
  try {
    const validation = validateProductListQuery(req.query);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    const rows = await productModel.getAllProducts(validation.value);

    const products = rows.map(row => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      price: row.price,
      thumbnailUrl: row.thumbnail_url,
      categoryId: row.category_id,
      categoryName: row.category_name
    }));

    return sendSuccess(res, {
      ...SUCCESS.PRODUCT_LIST_SUCCESS,
      data: products
    });
  } catch (error) {
    console.error('Database query error (GET /api/products):', error);
    return sendError(res);
  }
}

// M2 1단계: 상품 상세 조회
async function getProductDetail(req, res) {
  try {
    const { id } = req.params;

    // 실제 로직: DB 접근 계층(모듈)을 통해 데이터 조회
    const product = await productModel.getProductById(id);

    if (!product) {
      return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    }

    // DB 필드 -> API 응답 필드 변환 계층.
    // 실제 쿼리로 교체 시 이 매핑 로직은 유지하고 모델 내부 쿼리만 교체하면 됨
    return sendSuccess(res, {
      ...SUCCESS.PRODUCT_DETAIL_SUCCESS,
      data: {
        id: product.id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        thumbnailUrl: product.thumbnail_url,
        description: product.description,
        usageInfo: product.usage_info,
        categoryId: product.category_id,
        categoryName: product.category_name
      }
    });

  } catch (error) {
    console.error('Error in GET /api/products/:id:', error);
    return sendError(res);
  }
}

module.exports = {
  getProducts,
  getProductDetail
};
