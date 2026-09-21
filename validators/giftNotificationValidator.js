const { parsePositiveInteger } = require('./commonValidator');

function validateGiftNotificationInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !Array.isArray(body.giftIds) || body.giftIds.length === 0 ||
      body.giftIds.some(id => parsePositiveInteger(id) === null)) {
    return { errorCode: 'INVALID_GIFT_IDS' };
  }
  // JSON 크기는 기존 express.json 제한을 사용한다. 문자열 ID는 허용하지 않는다.
  return { value: [...new Set(body.giftIds)].sort((a, b) => a - b) };
}

module.exports = { validateGiftNotificationInput };
