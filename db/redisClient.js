const Redis = require('ioredis');
require('dotenv').config();

// Redis 장애 시에도 서비스가 죽지 않도록, 명령 재시도를 짧게 제한해서
// 연결 불가 상황에서 요청이 오래 대기하지 않고 빨리 실패하게 한다.
// (호출부는 이 실패를 잡아서 DB 조회로 폴백한다)
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 1,
  // 기본 재연결 로직은 실패해도 계속 백그라운드에서 재시도하며 타이머를 붙잡고 있어서,
  // Redis가 아예 없는 환경(테스트 등)에서 Node 프로세스가 안 끝나는 문제가 생긴다.
  // 최초 연결 실패 후에는 더 재시도하지 않고 포기해서, 항상 DB 폴백 경로로 빠르게 넘어가게 한다.
  retryStrategy: () => null
});

redis.on('error', (err) => {
  console.error('Redis 연결 에러:', err.message);
});

module.exports = redis;
