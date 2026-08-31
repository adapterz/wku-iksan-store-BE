const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
require('dotenv').config();

const productsRouter = require('./routes/products');
const authRouter = require('./routes/auth'); // 추가
const usersRouter = require('./routes/users');
const ordersRouter = require('./routes/orders');
const giftsRouter = require('./routes/gifts');
const categoriesRouter = require('./routes/categories');
const wishlistsRouter = require('./routes/wishlists');
const brandsRouter = require('./routes/brands');

const { sendError } = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// 응답 헤더에 프레임워크 정보(X-Powered-By: Express)가 노출되지 않도록 비활성화
app.disable('x-powered-by');

// X-Content-Type-Options, X-Frame-Options, HSTS 등 브라우저가 참고하는 보안 헤더 일괄 적용.
// 이 서버는 HTML을 렌더링하지 않는 순수 JSON API라 CSP는 의미가 없어 비활성화한다.
app.use(helmet({ contentSecurityPolicy: false }));

// 세션 시크릿은 프로덕션에서 반드시 환경변수로 주입되어야 하며,
// 없으면 하드코딩된 값으로 서명되는 대신 즉시 기동을 중단한다.
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    console.error('SESSION_SECRET 환경변수가 설정되지 않았습니다. 프로덕션 환경에서는 필수입니다.');
    process.exit(1);
  }
  console.warn('SESSION_SECRET 환경변수가 없어 개발용 임시 값을 사용합니다. 배포 전 반드시 설정하세요.');
}

// JSON 요청 본문 파싱 미들웨어
app.use(express.json());

// 세션 미들웨어 설정
app.use(session({
  secret: sessionSecret || 'dev-only-insecure-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // 개발 환경은 http 사용
    httpOnly: true
  }
}));

// GET /api/health 라우터 설정
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/products', productsRouter);
app.use('/api/auth', authRouter); // 추가
app.use('/api/users', usersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/gifts', giftsRouter);
// M3 API 구현 전 라우터 구조를 먼저 등록한다.
app.use('/api/categories', categoriesRouter);
app.use('/api/wishlists', wishlistsRouter);
app.use('/api/brands', brandsRouter);

// 정의되지 않은 경로 처리 (Express 기본 404 HTML 대신 통일된 JSON 응답)
app.use((req, res) => {
  return sendError(res, { status: 404, code: 'NOT_FOUND' });
});

// 전역 에러 핸들러: try/catch를 벗어난 오류(예: 잘못된 JSON 바디)가
// Express 기본 핸들러로 넘어가 스택트레이스가 그대로 노출되는 것을 막는다.
// 상세 내용은 서버 로그에만 남기고, 클라이언트에는 일반화된 메시지만 응답한다.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  // 잘못된 요청(예: malformed JSON body)은 4xx로 응답하되, 원본 메시지는 노출하지 않는다.
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) {
    return sendError(res, { status, code: 'BAD_REQUEST' });
  }

  return sendError(res);
});

// 포트로 서버 실행
app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
