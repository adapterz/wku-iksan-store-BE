const brandModel = require('../db/models/brandModel');
const { sendSuccess, sendError } = require('../routes/api');
const { SUCCESS, ERROR } = require('../constants/responseCodes');
const { validateBrandListQuery } = require('../validators/brandValidator');

// 브랜드 모아보기(keyword 없음) / 브랜드 검색(keyword 있음)을 함께 처리한다.
async function getBrands(req, res) {
  try {
    const validation = validateBrandListQuery(req.query);
    if (validation.errorCode) {
      return sendError(res, ERROR[validation.errorCode]);
    }

    const rows = await brandModel.getBrands(validation.value);

    const brands = rows.map(row => ({
      brand: row.brand,
      productCount: row.product_count,
      thumbnailUrl: row.thumbnail_url
    }));

    return sendSuccess(res, {
      ...SUCCESS.BRAND_LIST_SUCCESS,
      data: brands
    });
  } catch (error) {
    console.error('Database query error (GET /api/brands):', error);
    return sendError(res);
  }
}

module.exports = {
  getBrands
};
