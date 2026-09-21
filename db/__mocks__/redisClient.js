// db/redisClient.js의 수동 mock. jest.mock('.../db/redisClient')가 이 파일을 찾으면
// 원본 모듈(new Redis() 호출부)을 전혀 실행하지 않고 이 mock으로 바로 대체한다.
// 팩토리 없이 jest.mock()만 호출해도 실제 Redis 연결 시도가 발생하지 않도록,
// 매번 각 테스트 파일에 동일한 mock 객체를 반복 작성하는 대신 이 파일 하나로 모은다.
module.exports = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  keys: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(0)
};
