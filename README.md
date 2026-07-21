# wku-iksan-store-BE

카카오 선물하기 클론 코딩 프로젝트(익산 지역상생 테마)의 백엔드(BE) 저장소입니다.

기존에는 FE/BE가 하나의 저장소(`wku-2026-2-kakao-shop`)에 통합되어 있었으나,
관리 포인트를 분리하기 위해 BE/FE 2개 저장소 체제로 정리되었습니다. 이 저장소는
BE(API 서버) 코드만 다룹니다.

## 기술 스택

- Node.js / Express
- MySQL (`mysql2`)
- `express-session` 기반 세션 인증
- `bcrypt` (비밀번호 해싱)

## 폴더 구조

```
app.js                 # 앱 진입점
routes/                 # API 라우터 (products, auth, users, orders, gifts)
db/                      # DB 연결 풀, 모델, 스키마/시드
  ├─ pool.js
  ├─ models/
  ├─ schema.sql
  └─ seed.sql
middlewares/            # 공통 미들웨어 (예: requireLogin)
public/images/          # 정적 이미지 서빙용 폴더
docs/                    # BE, DB 관련 개발 기록 문서
infra/                   # nginx, cloud, architecture 등 인프라 관련 문서
archive/wiki/            # 기존 저장소 GitHub Wiki 아카이브
```

## 실행 방법 (로컬)

```bash
npm install
cp .env.example .env   # 값 채운 뒤 사용
npm run dev             # nodemon으로 개발 서버 실행
# 또는
npm start
```

필요한 환경변수는 `.env.example`을 참고하세요 (`PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET`).

## API 개요

- `GET /api/health` — 헬스 체크
- `/api/products` — 상품 목록/상세 조회
- `/api/auth` — 회원가입/로그인/로그아웃
- `/api/users` — 유저 검색 등
- `/api/orders` — 주문 생성/조회
- `/api/gifts` — 선물함 조회, 바코드 사용 처리

세부 API 명세는 `archive/wiki/API-설계.md`를 참고하세요.

## 배포

BE 단독 배포 절차는 아직 정리되지 않았습니다. `Dockerfile`, `docker-compose.yml`,
`deploy.sh`, `ecosystem.config.js`, `.github/workflows/deploy.yml`은 기존 통합 저장소
버전을 그대로 쓸 수 없어 BE 단독 배포 기준으로 재작성이 필요합니다
(자세한 내용은 [infra/deploy_todo.md](infra/deploy_todo.md) 참고). 추후 별도 단계에서 작성 예정입니다.
