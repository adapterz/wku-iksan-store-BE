// 인증 API에서 공통으로 사용하는 입력값 검증 규칙이다.
// 라우터는 검증 결과의 errorCode를 공통 응답 상수와 연결해 응답한다.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const NICKNAME_PATTERN = /^[가-힣A-Za-z0-9]+$/u;

// 프로젝트 범위에서 우선 차단할 흔한 비밀번호 목록이다.
// 비교할 때 대소문자를 구분하지 않아 단순한 변형도 함께 차단한다.
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '11111111',
  'abc12345',
  'admin123',
  'iloveyou',
  'letmein123',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'qwertyuiop',
  'welcome1',
  'welcome123'
]);

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function containsWhitespace(value) {
  return /\s/u.test(value);
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function validateEmail(value) {
  if (isMissing(value)) {
    return { errorCode: 'REQUIRED_EMAIL' };
  }

  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_EMAIL_TYPE' };
  }

  const normalizedValue = normalizeEmail(value);

  if (!normalizedValue) {
    return { errorCode: 'REQUIRED_EMAIL' };
  }

  if (normalizedValue.length > 255) {
    return { errorCode: 'EMAIL_TOO_LONG' };
  }

  if (!EMAIL_PATTERN.test(normalizedValue)) {
    return { errorCode: 'INVALID_EMAIL_FORMAT' };
  }

  return { value: normalizedValue };
}

function validateSignupPassword(value) {
  if (isMissing(value)) {
    return { errorCode: 'REQUIRED_PASSWORD' };
  }

  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_PASSWORD_TYPE' };
  }

  if (containsWhitespace(value)) {
    return { errorCode: 'INVALID_PASSWORD_FORMAT' };
  }

  if (value.length < 8) {
    return { errorCode: 'PASSWORD_TOO_SHORT' };
  }

  if (value.length > 15) {
    return { errorCode: 'PASSWORD_TOO_LONG' };
  }

  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return { errorCode: 'COMMON_PASSWORD' };
  }

  return { value };
}

function validateLoginPassword(value) {
  if (isMissing(value)) {
    return { errorCode: 'REQUIRED_PASSWORD' };
  }

  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_PASSWORD_TYPE' };
  }

  // 기존 가입자의 호환성을 위해 로그인 비밀번호는 변경하지 않는다.
  return { value };
}

function validateNickname(value) {
  if (isMissing(value)) {
    return { errorCode: 'REQUIRED_NICKNAME' };
  }

  if (typeof value !== 'string') {
    return { errorCode: 'INVALID_NICKNAME_TYPE' };
  }

  if (containsWhitespace(value)) {
    return { errorCode: 'INVALID_NICKNAME_FORMAT' };
  }

  if (value.length < 2) {
    return { errorCode: 'NICKNAME_TOO_SHORT' };
  }

  if (value.length > 8) {
    return { errorCode: 'NICKNAME_TOO_LONG' };
  }

  if (!NICKNAME_PATTERN.test(value)) {
    return { errorCode: 'INVALID_NICKNAME_FORMAT' };
  }

  return { value };
}

module.exports = {
  containsWhitespace,
  normalizeEmail,
  validateEmail,
  validateSignupPassword,
  validateLoginPassword,
  validateNickname
};
