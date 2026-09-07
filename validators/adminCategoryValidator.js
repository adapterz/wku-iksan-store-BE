// categories.name 컬럼 정의(VARCHAR(50))와 동일하게 맞춘 길이 제한
const MAX_CATEGORY_NAME_LENGTH = 50;

function validateCategoryName(value) {
  if (value === undefined || value === null || value === '') {
    return { errorCode: 'REQUIRED_CATEGORY_NAME' };
  }

  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_CATEGORY_NAME' };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { errorCode: 'REQUIRED_CATEGORY_NAME' };
  }

  if (trimmed.length > MAX_CATEGORY_NAME_LENGTH) {
    return { errorCode: 'CATEGORY_NAME_TOO_LONG' };
  }

  return { value: trimmed };
}

module.exports = {
  MAX_CATEGORY_NAME_LENGTH,
  validateCategoryName
};
