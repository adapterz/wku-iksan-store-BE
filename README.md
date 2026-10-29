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

배포는 `main` 브랜치를 기준으로 합니다. **`main`에 push하면 운영 배포가 자동으로 시작되므로, 배포 전 확인을 마친 뒤 병합합니다.** 로컬 실행 안내를 운영 환경에 그대로 적용하지 않습니다.

아래 운영 정보는 [Bio의 배포 절차 공유](https://github.com/adapterz/wku-iksan-store-BE/pull/150#issuecomment-6467717885)를 기준으로 정리했습니다(2026-10-28). 문서에 절차가 기재되어 있다는 것이 개별 배포의 확인 완료를 의미하지는 않습니다.

### 1. 배포 조건

| 상황 | 실행되는 워크플로 | 동작 |
| --- | --- | --- |
| PR 생성·갱신 | `Test` | Node.js 24에서 `npm ci` → `npm test`. 배포하지 않음 |
| `develop`에 병합 | 배포 워크플로 없음 | 운영 배포하지 않음 |
| `main`에 push (PR 병합 포함) | `Deploy BE` | 이미지 빌드·푸시 → BE 서버 재배포 |
| `main`에 push하며 `infra/nginx/**` 변경 | `Deploy Nginx Config` 추가 실행 | Nginx 설정 전송 → 컨테이너 기동 → 설정 검사 통과 시 reload |

- **BE 배포 흐름:** `Deploy BE`가 `latest` 태그의 이미지를 사설 레지스트리에 올린 뒤 BE 서버의 `~/wku-iksan-store-BE/deploy.sh`를 실행합니다. 스크립트는 `main` 전환 → `git pull origin main` → `docker compose pull` → `docker compose up -d` 순서로 진행하며, 명령 실패 시 중단합니다.
- **시간·서비스 영향:** Bio 공유 기준 보통 3분 안팎, 길면 약 8분이며 환경에 따라 달라집니다. 컨테이너 교체 중 짧은 응답 중단이 발생할 수 있습니다. 로그인 세션은 서버 메모리에 저장되므로 재로그인이 필요할 수 있습니다.
- **일부 변경만 배포:** `main`에서 만든 별도 브랜치에 필요한 커밋을 cherry-pick하고 검증한 뒤 `main` 대상 PR로 병합합니다. `develop` 전체를 병합하면 그동안 누적된 변경이 모두 배포 대상에 포함됩니다.

### 2. 배포 전 확인

`main` 병합 전에 확인합니다.

- [ ] PR의 `Test`가 통과했다.
- [ ] 배포 대상 변경을 확인했다. 특히 `.env.example`, `db/migrate_*.sql`, `db/schema.sql`, `docker-compose.yml`, `Dockerfile`, `infra/nginx/` 변경 여부를 확인한다.
- [ ] 새 환경변수가 필요하면 배포 담당자가 서버의 `.env`에 먼저 설정했다. `NODE_ENV=production`에서는 `SESSION_SECRET`과 `SEARCH_LOG_HASH_SALT`가 없으면 기동이 중단된다.
- [ ] DB 변경이 있으면 아래 적용 순서와 구버전 코드 호환성을 확인했다.
- [ ] 날짜 처리 변경 시 DB 세션의 `NOW()`가 KST인지, 기존 제재 `ends_at`의 저장 기준이 무엇인지 확인했다. 기준 확인 없이 일괄 시간 보정을 하지 않는다.
- [ ] 상품 목록 캐시 방식 변경 시 구버전·신버전이 동시에 요청을 처리하는지 확인했다. 세대 교체 방식과 구버전 키 삭제 방식은 캐시 무효화를 공유하지 않으므로 혼용·롤백 시 대상 캐시 무효화 또는 TTL 경과를 확인한다. **Redis 전체 삭제는 하지 않는다.**
- [ ] 응답 중단·재로그인 가능성을 팀에 공유하고 배포 시간을 조율했다.

**DB 변경 적용 순서**

1. **백업 확인:** Bio 공유 기준 DB 백업은 매일 새벽 3시에 자동 생성됩니다. 실제 최근 백업의 생성 시각과 성공 여부, 복구 가능 여부를 확인하고 변경이 크면 적용 직전에 수동 백업을 추가합니다.
2. **호환성 확인:** 마이그레이션 적용 후에도 현재 운영 중인 구버전 코드가 동작하는지 먼저 검토합니다. 스키마 변경이 크거나 호환되지 않으면 배포 담당자와 구 BE 중지·진행 중 쓰기 종료를 확인한 뒤 적용합니다.
3. **SQL 적용:** 배포 담당자(Bio)가 검토된 미적용 `db/migrate_*.sql`만 파일별로 적용합니다. **운영 DB에 `schema.sql`과 `seed.sql`을 재실행하지 않습니다.**
4. **DB 검증:** 테이블·컬럼·제약과 필요한 데이터 변경 결과를 확인하고 팀에 공유합니다.
5. **코드 배포:** DB 검증이 끝난 뒤 `main`에 병합해 새 코드를 배포합니다. DB 검증 실패 시 병합을 진행하지 않습니다.

변경별 세부 점검 근거는 [DB 날짜 변환 기준](docs/BE/DATABASE_TIMEZONE.md), [상품 목록 캐시 전환 주의사항](docs/BE/PRODUCT_LIST_CACHE.md#배포-시-참고)에 정리되어 있습니다.

### 3. 배포 후 확인

**GitHub Actions**

- `Deploy BE`의 `build-and-push`, `deploy`가 모두 성공했는지 확인합니다.
- Nginx 설정 변경이 포함됐다면 별도로 실행되는 `Deploy Nginx Config`도 확인합니다.
- 워크플로 성공만으로 서비스 정상 동작을 판단하지 않고 아래 점검을 이어서 진행합니다.

**BE 서버 — `~/wku-iksan-store-BE`에서 실행**

```bash
cd ~/wku-iksan-store-BE
docker compose ps
docker compose logs --tail 50 be
```

BE 컨테이너가 `healthy`인지 확인하고 기동 로그의 환경변수·DB 연결 오류 등을 확인합니다. healthcheck는 `/api/health` 응답 기준이며 DB·Redis까지 검증하지는 않습니다.

**공개 API — 로컬 터미널에서도 확인 가능**

```bash
curl -i https://iksan.store/api/health
curl -i https://iksan.store/api/products
```

Windows PowerShell에서는 별칭과 구분해 `curl.exe`를 사용합니다. health는 HTTP 200과 `{"status":"ok"}`, products는 HTTP 200과 상품 목록을 확인합니다. 이번 배포 기능의 PR 검증 항목도 운영에서 확인하되, 데이터 변경이 필요한 검증은 승인된 계정·대상으로 진행합니다.

**Nginx 서버 — 설정 변경이 있을 때 `~/nginx`에서 실행**

```bash
cd ~/nginx
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -T
```

이 명령은 BE 서버의 Compose 디렉터리가 아니라 **Nginx 서비스가 있는 서버·디렉터리**에서 실행합니다. 설정 검사 결과와 실행 중 컨테이너가 읽는 설정을 확인하고 공개 경로의 실제 응답도 점검합니다. 파일 수정이나 reload 명령 성공만으로 반영 완료를 판단하지 않습니다.

### 4. 문제 발생 시 대응

- **기동 실패·`unhealthy`:** BE 로그를 먼저 확인하고 환경변수, DB 연결, 포트와 컨테이너 상태를 점검합니다.
- **코드 되돌리기:** 현재 배포 워크플로는 `latest` 태그만 푸시하며 이전 릴리스 태그를 선택하는 롤백 절차는 마련되어 있지 않습니다. 배포 담당자와 되돌릴 범위를 확인하고, 문제가 된 변경을 revert한 PR을 `main`에 병합해 재배포합니다. 자동으로 즉시 복구되는 것은 아니므로 재배포 후에도 정상 동작을 확인합니다.
- **DB 변경 되돌리기:** 코드 revert로 DB 마이그레이션까지 되돌아가지는 않습니다. 새 테이블 추가를 포함해 **이전 코드와 호환됨을 확인한 경우에만** DB를 유지하고 코드만 되돌립니다. 컬럼 변경·백필·FK 변경은 데이터와 기존 코드에 미치는 영향을 확인합니다. 복구가 필요하면 Bio와 절차를 조율하며 임의로 테이블을 삭제하거나 백업을 덮어쓰지 않습니다.
