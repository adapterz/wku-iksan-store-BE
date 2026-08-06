// JSON body의 숫자는 그대로 검사하고, URL params/query는 숫자 문자열도 허용한다.
function parsePositiveInteger(value, { allowString = false } = {}) {
  let normalizedValue = value;

  if (allowString) {
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
      return null;
    }
    normalizedValue = Number(value);
  }

  if (!Number.isSafeInteger(normalizedValue) || normalizedValue <= 0) {
    return null;
  }

  return normalizedValue;
}

module.exports = {
  parsePositiveInteger
};
