const express = require('express');

// 라우터 테스트용 최소 앱. 실제 express-session 대신 req.session을 직접 주입해
// 쿠키/DB 없이도 로그인 상태를 재현할 수 있게 한다.
function createTestApp(mountPath, router, { session = {} } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = { ...session };
    next();
  });
  app.use(mountPath, router);
  return app;
}

module.exports = { createTestApp };
