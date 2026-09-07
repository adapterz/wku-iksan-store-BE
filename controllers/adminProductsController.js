const productModel = require('../db/models/productModel');
const categoryModel = require('../db/models/categoryModel');
// 랭킹은 5분 서버 캐시를 쓰므로(productsController.js), 상품 등록/수정/상태변경 후에는
// 캐시를 초기화해야 숨김 처리한 상품이 캐시 만료 전까지 랭킹에 계속 남는 걸 막을 수 있다.
const { resetRankingCache } = require('./productsController');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { parsePositiveInteger } = require('../validators/commonValidator');
const {
  validateProductCreateInput,
  validateProductUpdateInput,
  validateProductStatus,
  validateProductStatusFilter
} = require('../validators/adminProductValidator');

function mapProduct(product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    price: product.price,
    thumbnailUrl: product.thumbnail_url,
    description: product.description,
    descriptionImageUrl: product.description_image_url,
    validPeriod: product.valid_period,
    usageMethod: product.usage_method,
    exchangeLocation: product.exchange_location,
    caution: product.caution,
    categoryId: product.category_id,
    categoryName: product.category_name,
    status: product.status
  };
}

// GET /api/admin/products?status=hidden — 상태 무관 조회, status는 선택 필터.
// 숨김/단종 상품은 고객용 API에서 아예 안 보이므로, 관리자가 다시 찾아 수정·복구하려면
// 이 API가 필요하다.
async function getProducts(req, res) {
  try {
    const { status } = req.query;
    const statusValidation = validateProductStatusFilter(status);
    if (statusValidation.errorCode) {
      return sendError(res, ERROR[statusValidation.errorCode]);
    }

    const rows = await productModel.getAllProductsForAdmin({ status: statusValidation.value });

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_PRODUCT_LIST_SUCCESS,
      data: rows.map(mapProduct)
    });

  } catch (error) {
    console.error('Error in GET /api/admin/products:', error);
    return sendError(res);
  }
}

// POST /api/admin/products
async function createProduct(req, res) {
  try {
    const validation = validateProductCreateInput(req.body);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    const category = await categoryModel.getCategoryById(validation.value.category_id);
    if (!category) {
      return sendError(res, ERROR.INVALID_CATEGORY_ID);
    }

    const product = await productModel.createProduct(validation.value);
    resetRankingCache();

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_PRODUCT_CREATE_SUCCESS,
      data: mapProduct(product)
    });

  } catch (error) {
    console.error('Error in POST /api/admin/products:', error);
    return sendError(res);
  }
}

// PATCH /api/admin/products/:id
async function updateProduct(req, res) {
  try {
    const productId = parsePositiveInteger(req.params.id, { allowString: true });
    if (productId === null) {
      return sendError(res, ERROR.INVALID_PRODUCT_ID);
    }

    const validation = validateProductUpdateInput(req.body);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    if (validation.value.category_id !== undefined) {
      const category = await categoryModel.getCategoryById(validation.value.category_id);
      if (!category) {
        return sendError(res, ERROR.INVALID_CATEGORY_ID);
      }
    }

    const product = await productModel.updateProduct(productId, validation.value);
    if (!product) {
      return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    }
    resetRankingCache();

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_PRODUCT_UPDATE_SUCCESS,
      data: mapProduct(product)
    });

  } catch (error) {
    console.error('Error in PATCH /api/admin/products/:id:', error);
    return sendError(res);
  }
}

// PATCH /api/admin/products/:id/status
async function updateProductStatus(req, res) {
  try {
    const productId = parsePositiveInteger(req.params.id, { allowString: true });
    if (productId === null) {
      return sendError(res, ERROR.INVALID_PRODUCT_ID);
    }

    const { status } = req.body || {};
    const statusValidation = validateProductStatus(status);
    if (statusValidation.errorCode) {
      return sendError(res, ERROR[statusValidation.errorCode]);
    }

    const product = await productModel.updateProductStatus(productId, statusValidation.value);
    if (!product) {
      return sendError(res, ERROR.PRODUCT_NOT_FOUND);
    }
    resetRankingCache();

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_PRODUCT_STATUS_UPDATE_SUCCESS,
      data: mapProduct(product)
    });

  } catch (error) {
    console.error('Error in PATCH /api/admin/products/:id/status:', error);
    return sendError(res);
  }
}

module.exports = {
  getProducts,
  createProduct,
  updateProduct,
  updateProductStatus
};
