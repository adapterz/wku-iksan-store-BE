const MAX_SEARCH_KEYWORD_LENGTH = 100;

// 선택 쿼리인 keyword가 전달됐을 때만 형식과 범위를 검사한다.
function validateBrandListQuery({ keyword } = {}) {
  let normalizedKeyword = null;

  if (keyword !== undefined) {
    if (typeof keyword !== 'string') {
      return { errorCode: 'INVALID_KEYWORD' };
    }

    normalizedKeyword = keyword.trim();
    if (!normalizedKeyword || normalizedKeyword.length > MAX_SEARCH_KEYWORD_LENGTH) {
      return { errorCode: 'INVALID_KEYWORD' };
    }
  }

  return {
    value: {
      keyword: normalizedKeyword
    }
  };
}

module.exports = {
  MAX_SEARCH_KEYWORD_LENGTH,
  validateBrandListQuery
};
