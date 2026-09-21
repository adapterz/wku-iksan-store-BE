// MySQL INT UNSIGNED: JS가 정확히 비교 가능한 범위. 0/누락은 유효하지 않다.
const MAX_AUTH_VERSION = 4294967295;
const isValidAuthVersion = value => Number.isInteger(value) && value >= 1 && value <= MAX_AUTH_VERSION;
module.exports = { MAX_AUTH_VERSION, isValidAuthVersion };
