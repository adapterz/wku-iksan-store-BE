const productModel = require('../db/models/productModel');
const categoryModel = require('../db/models/categoryModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { parsePositiveInteger } = require('../validators/commonValidator');
const {
  validateProductCreateInput,
  validateProductUpdateInput,
  validateProductStatus
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
  createProduct,
  updateProduct,
  updateProductStatus
};
