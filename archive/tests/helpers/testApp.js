const express = require('express');

// 라우터 테스트용 최소 앱. 실제 express-session 대신 req.session을 직접 주입해
// 쿠키/DB 없이도 로그인 상태를 재현할 수 있게 한다.
function createTestApp(mountPath, router, { session = {} } = {}) {
  // 이 helper는 라우터의 입력/응답 테스트용이다. 인증 DB 상태를 명시적으로 모의한다.
  // 실제 버전 불일치/구 세션/DB 실패/쿠키 흐름은 sessionInvalidation 통합 테스트에서 검증.
  const userModel = require('../../../db/models/userModel');
  const needsFixture = !jest.isMockFunction(userModel.getAuthStateById);
  if (needsFixture) jest.spyOn(userModel, 'getAuthStateById');
  if (needsFixture || !userModel.getAuthStateById.getMockImplementation()) {
    userModel.getAuthStateById.mockImplementation(async id => ({ id, auth_version: 1 }));
  }
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = {
      regenerate: (callback) => callback(),
      save: (callback) => callback(),
      destroy: (callback) => callback(),
      ...(session.userId ? { authVersion: 1 } : {}),
      ...session
    };
    next();
  });
  app.use(mountPath, router);
  return app;
}

module.exports = { createTestApp };
