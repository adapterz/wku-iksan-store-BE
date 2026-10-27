# wku-iksan-store-BE

**익산 지역상생**을 테마로 한 **기프티콘 선물 쇼핑몰**의 **백엔드(API 서버)** 저장소입니다.
처음에는 카카오톡 선물하기 기능을 그대로 클론하는 것을 목표로 시작했지만, 산지직송 등 다양한 상품군을 함께 다루던 초기 기획에서
**기프티콘 중심**으로 서비스 형태를 통일해, 익산 지역 상권을 살리는 기프티콘 선물 서비스로 방향을 다듬었습니다.
회원가입/로그인부터 상품 탐색, 장바구니, 주문, 선물 발송·수신, 리뷰, 문의/신고, 관리자 운영까지 서비스 전 구간의 API를 제공합니다.

원래는 FE/BE가 하나의 저장소(`wku-2026-2-kakao-shop`)로 통합되어 있었으나, 관리 포인트를 분리하기 위해
BE/FE 2개 저장소 체제로 정리되었습니다. 이 저장소는 **BE(API 서버) 코드만** 다루며, 화면 관련 작업은 FE 저장소에서 진행합니다.

## 주요 기능

- **회원/인증** — 이메일 회원가입·로그인, 세션 기반 인증, 비밀번호 변경 시 전체 세션 무효화
- **상품 탐색** — 상품·카테고리·브랜드 목록/상세 조회, 검색
- **장바구니 & 주문** — 장바구니 담기/수정, 여러 상품을 한 번에 묶는 주문 그룹 단위 주문
- **선물하기** — 친구에게 선물 보내기, 선물함 조회, 바코드로 매장에서 사용 처리
- **위시리스트** — 관심 상품 찜하기
- **리뷰** — 사용 완료한 선물에 대한 리뷰 작성·조회·수정·삭제, 상품별 공개 리뷰·통계
- **문의/신고** — 사용자 문의 등록, 부적절한 리뷰 신고
- **관리자** — 회원·상품·카테고리·리뷰·문의·신고·제재 관리, 운영 대시보드

## 프로젝트 개요

지역 상권과 연계한 온라인 선물하기 서비스를 목표로 팀이 함께 만드는 부트캠프 팀 프로젝트입니다.
FE/BE/Cloud 역할을 나눠 기능 단위 브랜치에서 개발하고 PR 리뷰와 통합 검증을 진행하며,
매일 데일리 스크럼과 정기 미팅으로 진행 상황을 맞춰가고 있습니다. 진행 중인 논의와 회의 기록은
[GitHub Wiki](https://github.com/adapterz/wku-iksan-store-BE/wiki)에 누적하고 있습니다.

### 팀 구성

| 담당자 | 역할 | 주로 하는 일 |
| --- | --- | --- |
| **Miku** | 팀장 · FE | 화면 구현, 사용자 흐름 설계, FE 저장소 작업 조율 |
| **Aon** | BE | 기존 BE 기능 유지보수·운영 안정화, 인증/공통 구조, 기존 API·DB 정합성 |
| **Ethan** | BE | BE 기능 개선·확장, 신규 기능(API/ERD/DB) 설계·구현, FE 연동 검증 |
| **Bio** | Cloud | 서버·CI/CD·Docker·Nginx 운영, 배포 실행, 운영 DB 마이그레이션 적용 |

BE 담당 구분은 우선 담당 영역을 나타내며, 작업 상황에 따라 범위를 조정합니다.
각 담당자는 필요한 작업을 협업하고, 다른 담당자가 작성한 PR을 상호 리뷰합니다.
역할·PR·배포 절차의 세부 기준은 Wiki의 [GitHub·직무 운영 Rule](https://github.com/adapterz/wku-iksan-store-BE/wiki/GitHub-직무-운영-Rule)에 정리되어 있습니다.

## 기술 스택

| 구분 | 도구 |
| --- | --- |
| 런타임 / 프레임워크 | Node.js, Express |
| 데이터베이스 | MySQL(`mysql2`), Redis(`ioredis`) |
| 인증 / 보안 | `express-session`, `bcrypt`, `helmet`, `express-rate-limit` |
| 테스트 | Jest 기반 API 테스트 |
| 개발 편의 | nodemon |
| CI | GitHub Actions (PR 자동 테스트) |

응답은 `{ status, code, message, data, meta? }` 형태로 통일하고, DB의 snake_case 컬럼은 API 응답에서 camelCase로 매핑합니다.
사용자 입력값은 항상 파라미터 바인딩으로 처리해 SQL 인젝션을 방지합니다.

## 폴더 구조

```
app.js                 # 앱 진입점, 미들웨어·라우터 등록
routes/                 # API 라우터 (products, auth, users, orders, gifts, reviews, cart-items, order-groups, admin 등)
controllers/            # 라우터별 비즈니스 로직
validators/             # 요청 값 검증
middlewares/            # 공통 미들웨어 (requireLogin, requireAdmin, rate limit 등)
constants/               # 세션/응답 코드 등 공용 상수
helpers/                # 재사용 유틸리티
db/                      # DB 연결 풀(pool.js), Redis 클라이언트, 모델, 스키마·시드·마이그레이션
scripts/                # DB 연동 수동 테스트 스크립트
archive/tests/           # Jest 자동화 테스트
public/images/           # 정적 이미지 서빙용 폴더
docs/                    # BE·DB 개발 기록 문서
infra/                   # nginx, cloud, architecture 등 인프라 관련 문서
.github/workflows/       # PR 테스트·배포 자동화(GitHub Actions)
```

## 개발 환경

Node.js **24**, MySQL **8.0.16 이상**, Redis **7**을 기준으로 합니다.
BE는 로컬 Node.js로 실행하며, FE 화면은 [별도 저장소](https://github.com/adapterz/wku-iksan-store-FE)에서 실행합니다.

**처음 실행한다면 [로컬 개발 환경 안내](docs/BE/DEVELOPMENT.md)를 순서대로 진행하세요.**
환경변수와 빈 로컬 DB·Redis 준비가 끝난 경우의 실행 명령은 다음과 같습니다.

```bash
npm ci
npm run dev
```

로컬 HTTP 실행은 `NODE_ENV=development`를 사용합니다.
`http://localhost:4000/api/health`와 `/api/products`로 기동·상품 조회를 확인합니다.
health 응답만으로 DB·Redis 연결까지 검증된 것은 아닙니다.

| 필요한 작업 | 안내 |
| --- | --- |
| 최초 설치·환경변수·DB/Redis 준비·테스트 계정·문제 해결 | [로컬 개발 환경](docs/BE/DEVELOPMENT.md) |
| Jest·실제 DB 테스트의 실행 조건과 명령 | [테스트 가이드](docs/BE/TESTING.md) |
| 환경변수 양식 | [.env.example](.env.example) |
| DB 날짜 처리 기준 | [DB 시간대](docs/BE/DATABASE_TIMEZONE.md) |

새 DB는 `schema.sql`로 준비하고, 기존 DB의 변경은 적용 이력을 확인한 마이그레이션으로 처리합니다.
**기존·운영 DB에 schema·seed를 재실행하지 않습니다.** 저장소의 `docker-compose.yml`은 배포 이미지용이며 로컬 소스 실행용이 아닙니다.

## 테스트

```bash
npm test -- --runInBand
```

CI는 `npm test`를 실행합니다. 실제 MySQL 테스트는 별도 준비와 명령이 필요합니다.
[테스트 가이드](docs/BE/TESTING.md)에서 기능별 7개 스크립트와 실행 조건을 확인하세요.

## API 개요

- `GET /api/health` — 헬스 체크
- `/api/auth` — 회원가입/로그인/로그아웃
- `/api/users` — 유저 검색 등
- `/api/products`, `/api/categories`, `/api/brands` — 상품/카테고리/브랜드 조회
- `/api/cart-items`, `/api/order-groups`, `/api/orders` — 장바구니·주문
- `/api/gifts` — 선물함 조회, 바코드 사용 처리
- `/api/wishlists` — 찜하기
- `/api/reviews`, `GET /api/products/:id/reviews` — 리뷰 작성/조회, 상품별 공개 리뷰·통계
- `/api/inquiries` — 문의 등록
- `/api/admin/*` — 관리자용 회원/상품/카테고리/리뷰/신고/문의/제재/대시보드 API

세부 API 명세는 Wiki [API 설계](https://github.com/adapterz/wku-iksan-store-BE/wiki/API-설계) 문서를,
DB 구조는 [db/ERD.md](db/ERD.md)를 참고하세요. 기능별 구현 배경·검증 방법은 `docs/BE/`, `docs/DB/` 아래 문서에 정리되어 있습니다.

찜 목록 응답에 추가된 `product.wishlistCount`와 검증 범위는 [찜 목록 관심 수](docs/BE/WISHLIST_COUNTS.md)를 참고하세요.

## 배포

운영 구성과 배포 절차는 배포 담당자(Bio)의 확인 후 보완합니다. 로컬 실행 안내를 운영 환경에 그대로 적용하지 않습니다.

기존 변경의 기술적 주의사항은 다음 문서에 유지합니다. 실제 운영 적용 여부를 나타내는 기록은 아닙니다.

- [DB 날짜 변환 기준](docs/BE/DATABASE_TIMEZONE.md)
- [상품 목록 캐시 전환 주의사항](docs/BE/PRODUCT_LIST_CACHE.md#배포-시-참고)
