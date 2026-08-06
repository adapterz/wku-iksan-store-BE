const categoryModel = require('../db/models/categoryModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS } = require('../constants/responseCodes');

// 카테고리 목록 조회 (인증 불필요, id 오름차순 고정 정렬)
async function getCategories(req, res) {
  try {
    const rows = await categoryModel.getAllCategories();

    const categories = rows.map(row => ({
      id: row.id,
      name: row.name
    }));

    return sendSuccess(res, {
      ...SUCCESS.CATEGORY_LIST_SUCCESS,
      data: categories
    });
  } catch (error) {
    console.error('Database query error (GET /api/categories):', error);
    return sendError(res);
  }
}

module.exports = {
  getCategories
};
