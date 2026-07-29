const {
  validateEmail,
  validateSignupPassword,
  validateLoginPassword,
  validateNickname
} = require('../../../validators/authValidator');

describe('validateEmail', () => {
  test('빈 값이면 REQUIRED_EMAIL', () => {
    expect(validateEmail(undefined).errorCode).toBe('REQUIRED_EMAIL');
    expect(validateEmail('').errorCode).toBe('REQUIRED_EMAIL');
    expect(validateEmail('   ').errorCode).toBe('REQUIRED_EMAIL');
  });

  test('문자열이 아니면 INVALID_EMAIL_TYPE', () => {
    expect(validateEmail(12345).errorCode).toBe('INVALID_EMAIL_TYPE');
  });

  test('형식이 잘못되면 INVALID_EMAIL_FORMAT', () => {
    expect(validateEmail('not-an-email').errorCode).toBe('INVALID_EMAIL_FORMAT');
  });

  test('255자를 넘으면 EMAIL_TOO_LONG', () => {
    const longLocal = 'a'.repeat(250);
    expect(validateEmail(`${longLocal}@test.com`).errorCode).toBe('EMAIL_TOO_LONG');
  });

  test('유효한 이메일은 trim/소문자 변환된 value를 반환', () => {
    const result = validateEmail('  User@Example.com  ');
    expect(result.errorCode).toBeUndefined();
    expect(result.value).toBe('user@example.com');
  });
});

describe('validateSignupPassword', () => {
  test('빈 값이면 REQUIRED_PASSWORD', () => {
    expect(validateSignupPassword(undefined).errorCode).toBe('REQUIRED_PASSWORD');
  });

  test('문자열이 아니면 INVALID_PASSWORD_TYPE', () => {
    expect(validateSignupPassword(12345678).errorCode).toBe('INVALID_PASSWORD_TYPE');
  });

  test('공백을 포함하면 INVALID_PASSWORD_FORMAT', () => {
    expect(validateSignupPassword('abcd 1234').errorCode).toBe('INVALID_PASSWORD_FORMAT');
  });

  test('8자 미만이면 PASSWORD_TOO_SHORT', () => {
    expect(validateSignupPassword('abc123').errorCode).toBe('PASSWORD_TOO_SHORT');
  });

  test('15자 초과면 PASSWORD_TOO_LONG', () => {
    expect(validateSignupPassword('a'.repeat(16)).errorCode).toBe('PASSWORD_TOO_LONG');
  });

  test('흔한 비밀번호면 COMMON_PASSWORD (대소문자 무관)', () => {
    expect(validateSignupPassword('Password123').errorCode).toBe('COMMON_PASSWORD');
  });

  test('조건을 만족하면 value를 그대로 반환', () => {
    const result = validateSignupPassword('myS3curePw');
    expect(result.errorCode).toBeUndefined();
    expect(result.value).toBe('myS3curePw');
  });
});

describe('validateLoginPassword', () => {
  test('빈 값이면 REQUIRED_PASSWORD', () => {
    expect(validateLoginPassword('').errorCode).toBe('REQUIRED_PASSWORD');
  });

  test('문자열이 아니면 INVALID_PASSWORD_TYPE', () => {
    expect(validateLoginPassword(true).errorCode).toBe('INVALID_PASSWORD_TYPE');
  });

  test('기존 가입자 호환을 위해 형식 검사 없이 통과', () => {
    const result = validateLoginPassword('a b');
    expect(result.errorCode).toBeUndefined();
    expect(result.value).toBe('a b');
  });
});

describe('validateNickname', () => {
  test('빈 값이면 REQUIRED_NICKNAME', () => {
    expect(validateNickname(undefined).errorCode).toBe('REQUIRED_NICKNAME');
  });

  test('문자열이 아니면 INVALID_NICKNAME_TYPE', () => {
    expect(validateNickname(123).errorCode).toBe('INVALID_NICKNAME_TYPE');
  });

  test('공백을 포함하면 INVALID_NICKNAME_FORMAT', () => {
    expect(validateNickname('닉 네임').errorCode).toBe('INVALID_NICKNAME_FORMAT');
  });

  test('2자 미만이면 NICKNAME_TOO_SHORT', () => {
    expect(validateNickname('a').errorCode).toBe('NICKNAME_TOO_SHORT');
  });

  test('8자 초과면 NICKNAME_TOO_LONG', () => {
    expect(validateNickname('a'.repeat(9)).errorCode).toBe('NICKNAME_TOO_LONG');
  });

  test('한글/영문/숫자 외 특수문자가 있으면 INVALID_NICKNAME_FORMAT', () => {
    expect(validateNickname('nick!!').errorCode).toBe('INVALID_NICKNAME_FORMAT');
  });

  test('유효한 닉네임은 value를 그대로 반환', () => {
    const result = validateNickname('아온123');
    expect(result.errorCode).toBeUndefined();
    expect(result.value).toBe('아온123');
  });
});
