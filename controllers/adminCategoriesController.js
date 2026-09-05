const categoryModel = require('../db/models/categoryModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { parsePositiveInteger } = require('../validators/commonValidator');
const { validateCategoryName } = require('../validators/adminCategoryValidator');

// POST /api/admin/categories
async function createCategory(req, res) {
  try {
    const { name } = req.body || {};
    const validation = validateCategoryName(name);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    const category = await categoryModel.createCategory(validation.value);

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_CATEGORY_CREATE_SUCCESS,
      data: category
    });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return sendError(res, ERROR.CATEGORY_ALREADY_EXISTS);
    }
    console.error('Error in POST /api/admin/categories:', error);
    return sendError(res);
  }
}

// PATCH /api/admin/categories/:id
async function updateCategory(req, res) {
  try {
    const categoryId = parsePositiveInteger(req.params.id, { allowString: true });
    if (categoryId === null) {
      return sendError(res, ERROR.INVALID_CATEGORY_ID);
    }

    const { name } = req.body || {};
    const validation = validateCategoryName(name);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    const category = await categoryModel.updateCategory(categoryId, validation.value);
    if (!category) {
      return sendError(res, ERROR.CATEGORY_NOT_FOUND);
    }

    return sendSuccess(res, {
      ...SUCCESS.ADMIN_CATEGORY_UPDATE_SUCCESS,
      data: category
    });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return sendError(res, ERROR.CATEGORY_ALREADY_EXISTS);
    }
    console.error('Error in PATCH /api/admin/categories/:id:', error);
    return sendError(res);
  }
}

module.exports = {
  createCategory,
  updateCategory
};
