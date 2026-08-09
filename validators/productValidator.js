const { parsePositiveInteger } = require('./commonValidator');

const MAX_SEARCH_KEYWORD_LENGTH = 100;

// 선택 쿼리인 keyword와 categoryId가 전달됐을 때만 형식과 범위를 검사한다.
function validateProductListQuery({ keyword, categoryId } = {}) {
  let normalizedKeyword = null;
  let normalizedCategoryId = null;

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

  return {
    value: {
      keyword: normalizedKeyword,
      categoryId: normalizedCategoryId
    }
  };
}

module.exports = {
  MAX_SEARCH_KEYWORD_LENGTH,
  validateProductListQuery
};
