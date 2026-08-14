const { parsePositiveInteger } = require('./commonValidator');

const MAX_SEARCH_KEYWORD_LENGTH = 100;
// products.brand 컬럼 정의(VARCHAR(255))와 동일하게 맞춘 길이 제한
const MAX_BRAND_LENGTH = 255;

// 선택 쿼리인 keyword, categoryId, brand가 전달됐을 때만 형식과 범위를 검사한다.
function validateProductListQuery({ keyword, categoryId, brand } = {}) {
  let normalizedKeyword = null;
  let normalizedCategoryId = null;
  let normalizedBrand = null;

  if (keyword !== undefined) {
    if (typeof keyword !== 'string') {
      return { errorCode: 'INVALID_KEYWORD' };
    }

    normalizedKeyword = keyword.trim();
    if (!normalizedKeyword || normalizedKeyword.length > MAX_SEARCH_KEYWORD_LENGTH) {
      return { errorCode: 'INVALID_KEYWORD' };
    }
  }

  if (categoryId !== undefined) {
    normalizedCategoryId = parsePositiveInteger(categoryId, { allowString: true });
    if (normalizedCategoryId === null) {
      return { errorCode: 'INVALID_CATEGORY_ID' };
    }
  }

  if (brand !== undefined) {
    if (typeof brand !== 'string') {
      return { errorCode: 'INVALID_BRAND' };
    }

    normalizedBrand = brand.trim();
    if (!normalizedBrand || normalizedBrand.length > MAX_BRAND_LENGTH) {
      return { errorCode: 'INVALID_BRAND' };
    }
  }

  return {
    value: {
      keyword: normalizedKeyword,
      categoryId: normalizedCategoryId,
      brand: normalizedBrand
    }
  };
}

module.exports = {
  MAX_SEARCH_KEYWORD_LENGTH,
  MAX_BRAND_LENGTH,
  validateProductListQuery
};
