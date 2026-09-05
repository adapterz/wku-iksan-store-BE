const { parsePositiveInteger } = require('./commonValidator');
const { MAX_BRAND_LENGTH } = require('./productValidator');

// products.name 컬럼 정의(VARCHAR(255))와 동일하게 맞춘 길이 제한
const MAX_NAME_LENGTH = 255;
const VALID_STATUSES = new Set(['active', 'hidden', 'discontinued']);

// 선택 필드는 문자열로 왔을 때만 trim하고, 없으면 null로 저장한다.
const OPTIONAL_TEXT_FIELDS = [
  'thumbnailUrl', 'description', 'descriptionImageUrl',
  'validPeriod', 'usageMethod', 'exchangeLocation', 'caution'
];

const FIELD_TO_COLUMN = {
  name: 'name',
  brand: 'brand',
  price: 'price',
  categoryId: 'category_id',
  thumbnailUrl: 'thumbnail_url',
  description: 'description',
  descriptionImageUrl: 'description_image_url',
  validPeriod: 'valid_period',
  usageMethod: 'usage_method',
  exchangeLocation: 'exchange_location',
  caution: 'caution'
};

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function validateOptionalText(value) {
  if (value === undefined) {
    return { present: false };
  }
  if (value === null) {
    return { present: true, value: null };
  }
  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_PRODUCT_NAME' };
  }
  return { present: true, value: value.trim() || null };
}

// create: 필수 필드(name, brand, price, categoryId)를 전부 검증한다.
function validateProductCreateInput(body = {}) {
  if (isMissing(body.name)) {
    return { errorCode: 'REQUIRED_PRODUCT_NAME' };
  }
  if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > MAX_NAME_LENGTH) {
    return { errorCode: 'INVALID_PRODUCT_NAME' };
  }

  if (isMissing(body.brand)) {
    return { errorCode: 'REQUIRED_BRAND' };
  }
  if (typeof body.brand !== 'string' || !body.brand.trim() || body.brand.trim().length > MAX_BRAND_LENGTH) {
    return { errorCode: 'INVALID_BRAND' };
  }

  if (isMissing(body.price)) {
    return { errorCode: 'REQUIRED_PRICE' };
  }
  const price = parsePositiveInteger(body.price);
  if (price === null) {
    return { errorCode: 'INVALID_PRICE' };
  }

  const categoryId = parsePositiveInteger(body.categoryId);
  if (categoryId === null) {
    return { errorCode: 'INVALID_CATEGORY_ID' };
  }

  const fields = {
    name: body.name.trim(),
    brand: body.brand.trim(),
    price,
    category_id: categoryId
  };

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const result = validateOptionalText(body[field]);
    if (result.errorCode) return result;
    if (result.present) {
      fields[FIELD_TO_COLUMN[field]] = result.value;
    }
  }

  return { value: fields };
}

// update: 전달된 필드만 부분 검증하고, DB 컬럼명으로 변환해 반환한다.
function validateProductUpdateInput(body = {}) {
  const fields = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > MAX_NAME_LENGTH) {
      return { errorCode: 'INVALID_PRODUCT_NAME' };
    }
    fields.name = body.name.trim();
  }

  if (body.brand !== undefined) {
    if (typeof body.brand !== 'string' || !body.brand.trim() || body.brand.trim().length > MAX_BRAND_LENGTH) {
      return { errorCode: 'INVALID_BRAND' };
    }
    fields.brand = body.brand.trim();
  }

  if (body.price !== undefined) {
    const price = parsePositiveInteger(body.price);
    if (price === null) {
      return { errorCode: 'INVALID_PRICE' };
    }
    fields.price = price;
  }

  if (body.categoryId !== undefined) {
    const categoryId = parsePositiveInteger(body.categoryId);
    if (categoryId === null) {
      return { errorCode: 'INVALID_CATEGORY_ID' };
    }
    fields.category_id = categoryId;
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const result = validateOptionalText(body[field]);
    if (result.errorCode) return result;
    if (result.present) {
      fields[FIELD_TO_COLUMN[field]] = result.value;
    }
  }

  if (Object.keys(fields).length === 0) {
    return { errorCode: 'EMPTY_PRODUCT_UPDATE' };
  }

  return { value: fields };
}

function validateProductStatus(value) {
  if (typeof value !== 'string' || !VALID_STATUSES.has(value)) {
    return { errorCode: 'INVALID_PRODUCT_STATUS' };
  }
  return { value };
}

module.exports = {
  MAX_NAME_LENGTH,
  VALID_STATUSES,
  validateProductCreateInput,
  validateProductUpdateInput,
  validateProductStatus
};
