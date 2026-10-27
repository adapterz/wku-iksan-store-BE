# 로컬 개발 환경

처음 참여하는 개발자가 로컬에서 BE 서버를 실행하고 인증·상품 조회를 확인하기 위한 안내입니다.
앱은 호스트의 Node.js로 실행하고, MySQL과 Redis는 로컬 인스턴스에 연결합니다.

- 모든 명령의 실행 위치: BE 저장소 루트
- 대상: 신규 로컬 DB와 로컬 Redis. 운영·공유 환경에는 적용하지 않습니다.
- 기존 환경 사용 시: DB 초기화와 seed 재실행을 생략하고 스키마 적용 상태부터 확인합니다.
- 테스트 실행: [테스트 가이드](TESTING.md)

[README로 돌아가기](../../README.md)

## 1. 준비 및 의존성 설치

| 준비물 | 기준 |
| --- | --- |
| Node.js / npm | Node.js **24** — 현재 CI·Dockerfile 기준 |
| MySQL / mysql 클라이언트 | **MySQL 8.0.16 이상**. `utf8mb4_0900_ai_ci`와 CHECK 제약을 사용하므로 MariaDB로 대체하지 않습니다 |
| Redis | **Redis 7** — 아래 Docker 예시 또는 별도 로컬 인스턴스 |
| Docker | 아래 Redis 예시를 사용할 때 필요. Docker Desktop/엔진이 실행 중이어야 합니다 |

```bash
git clone https://github.com/adapterz/wku-iksan-store-BE.git
cd wku-iksan-store-BE
git switch develop
npm ci
```

이미 저장소가 있다면 clone은 생략하고 작업 브랜치를 확인합니다. 미커밋 변경이 있는 폴더에서 임의로 브랜치를 전환하지 마세요.

## 2. 환경변수 설정

`.env`가 없을 때만 [.env.example](../../.env.example)을 복사합니다. 기존 파일을 덮어쓰지 마세요.

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# macOS / Linux
cp .env.example .env
```

복사한 파일에서 다음 값을 설정합니다. **실제 비밀값과 `.env`는 커밋하지 않습니다.**

| 변수 | 이 안내의 로컬 설정 |
| --- | --- |
| `PORT` | `4000` |
| `DB_HOST`, `DB_PORT` | `127.0.0.1`, `3306` — 실제 로컬 MySQL 포트에 맞게 변경 |
| `DB_NAME` | `iksanshop_local` — 예제 파일의 `iksanshop` 대신 아래에서 만들 로컬 DB 이름 사용 |
| `DB_USER`, `DB_PASSWORD` | 아래에서 만들 `wku_local` 계정과 직접 정한 로컬 비밀번호 |
| `REDIS_HOST`, `REDIS_PORT` | `127.0.0.1`, `6380` — 아래 Redis 예시 기준 |
| `REDIS_PASSWORD` | 아래 예시는 비밀번호 없이 루프백에만 공개하므로 빈 값. 별도 Redis를 쓰면 해당 설정 사용 |
| `SESSION_SECRET` | 로컬용 무작위 문자열 |
| `SEARCH_LOG_HASH_SALT` | 세션 비밀값과 별도로 생성한 로컬용 무작위 문자열 |
| `RATE_LIMIT_*` | 처음에는 예제의 기본값 유지 |

비밀값은 다음 명령을 **두 번 실행해 각각 다른 값**으로 채울 수 있습니다.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

로컬 HTTP 실행은 `NODE_ENV=development`를 사용합니다. `production`에서는 HTTPS용 Secure 쿠키가 설정되고 두 비밀값이 없으면 기동이 중단됩니다. 셸에 이미 설정된 환경변수는 `.env`보다 우선하므로 다른 프로젝트의 `DB_*` 등이 남아 있지 않은지도 확인하세요.

## 3. 빈 로컬 DB 준비

로컬 MySQL이 실행 중인 상태에서 DB 생성 권한이 있는 **로컬 계정**으로 접속합니다. 아래 `root`는 초기 준비용이며 앱은 `wku_local` 계정으로 실행합니다.

```bash
mysql --host=127.0.0.1 --port=3306 --user=root --password --default-character-set=utf8mb4
```

MySQL 프롬프트에서 실행합니다. `LOCAL_DB_PASSWORD`는 직접 정한 로컬 비밀번호로 바꾸고 `.env`에도 같은 값을 넣습니다.

```sql
CREATE DATABASE iksanshop_local CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'wku_local'@'127.0.0.1' IDENTIFIED BY 'LOCAL_DB_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON iksanshop_local.* TO 'wku_local'@'127.0.0.1';
USE iksanshop_local;
SOURCE db/schema.sql;
SOURCE db/seed.sql;
SELECT COUNT(*) AS products FROM products;
SELECT @@global.time_zone, @@session.time_zone, NOW(), UTC_TIMESTAMP();
```

- 새 DB에 seed를 한 번 적용하면 상품 **33개**가 생성됩니다. 이미 DB·계정이 있으면 오류를 무시하고 계속하거나 삭제하지 말고, 기존 상태부터 확인합니다.
- `schema.sql`은 현재 전체 구조를 담고 있습니다. **새 DB에 schema를 적용한 뒤 `migrate_*.sql`을 전부 추가 실행하지 않습니다.** 마이그레이션은 기존 DB를 변경할 때 적용 여부와 순서를 확인해서 사용합니다.
- `seed.sql`은 상품·카테고리를 단순 INSERT하므로 **기존 데이터가 있는 DB에 재실행하지 않습니다.** 운영 데이터 복원용도 아닙니다.
- 날짜 처리는 KST DATETIME 기준입니다. 로컬 MySQL의 기본 시간대를 `+09:00`으로 설정하고, `NOW()`가 한국 시각인지 확인합니다. `SYSTEM`이라면 실제 서버 OS 시간대도 확인해야 합니다. 앱의 `timezone: '+09:00'` 옵션은 **MySQL 세션 시간대를 바꾸지 않습니다.** 자세한 기준은 [DB 날짜 변환 기준](DATABASE_TIMEZONE.md)을 참고하세요.
- `SOURCE` 경로를 못 찾으면 저장소 루트에서 mysql을 실행했는지 확인하거나 파일의 절대 경로를 사용합니다.

## 4. 로컬 Redis 실행

별도 로컬 Redis가 없다면 다음처럼 **로컬 전용 컨테이너**를 만듭니다. 기존 6379 포트와 구분하기 위해 호스트 포트는 6380을 사용합니다.

```bash
docker run --name wku-local-redis -d -p 127.0.0.1:6380:6379 redis:7-alpine
docker exec wku-local-redis redis-cli ping
```

`PONG`이 나오면 정상입니다. 이미 이 이름으로 만든 컨테이너가 있다면 `docker start wku-local-redis`로 다시 켭니다. 작업 후에는 `docker stop wku-local-redis`로 중지할 수 있습니다.

**저장소의 `docker-compose.yml`은 배포 이미지용입니다.** `docker compose up`을 로컬 소스 실행 명령으로 사용하지 마세요. BE는 아래 npm 명령으로 실행합니다. 로컬 개발용 Redis를 공유·운영 Redis와 섞지 않습니다.

## 5. 서버 실행 및 기본 확인

```powershell
# Windows PowerShell
$env:NODE_ENV = 'development'
npm run dev
```

```bash
# macOS / Linux
NODE_ENV=development npm run dev
```

자동 재시작이 필요 없으면 같은 환경에서 `npm start`를 사용합니다. 종료는 `Ctrl+C`입니다.

| 확인 주소 | 기대 결과 |
| --- | --- |
| `http://localhost:4000/api/health` | HTTP 200, `{"status":"ok"}` |
| `http://localhost:4000/api/products` | HTTP 200, 상품 목록 반환 |
| `http://localhost:4000/api/auth/me` | 로그인 전에는 HTTP 401 — 정상적인 인증 거절 |

**health 응답은 DB·Redis 연결 성공까지 보장하지 않습니다.** 상품 조회와 서버 오류 로그, Redis의 `PONG`도 함께 확인합니다.
BE만 실행하면 API를 확인할 수 있으며 FE 화면이 열리는 것은 아닙니다. 화면 검증은 [FE 저장소](https://github.com/adapterz/wku-iksan-store-FE)의 로컬 실행·API 프록시 설정을 함께 맞춰야 합니다. seed의 `/images/description_*.webp`는 FE 이미지 경로입니다.

## 6. 테스트 계정 준비

seed에는 `test@example.com`과 `admin@example.com` 계정이 있지만 비밀번호는 해시로 저장돼 있습니다. **원문 비밀번호를 추측하지 말고 직접 정한 비밀번호로 새 로컬 계정을 가입**해서 사용합니다.

PowerShell 예시입니다. 다른 환경에서는 동일한 JSON을 API 클라이언트로 전송해도 됩니다. 아래 계정·비밀번호는 로컬 예시이며 운영에 사용하지 않습니다.

```powershell
$body = @{ email = 'localuser@example.test'; password = 'LocalQa2026!'; nickname = 'localqa' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/signup -ContentType 'application/json' -Body $body
Invoke-RestMethod -Method Post -Uri http://localhost:4000/api/auth/login -ContentType 'application/json' -Body $body -SessionVariable localSession
Invoke-RestMethod -Uri http://localhost:4000/api/auth/me -WebSession $localSession
```

관리자 테스트가 필요하면 **별도 계정**을 같은 방식으로 가입한 뒤, 로컬 DB 준비용 계정으로 접속해 그 계정만 승격합니다. 예를 들어 `localadmin@example.test` / 닉네임 `localadm`으로 가입했다면:

```sql
USE iksanshop_local;
SELECT id, email, role FROM users WHERE email = 'localadmin@example.test';
UPDATE users SET role = 'admin' WHERE email = 'localadmin@example.test';
SELECT id, email, role FROM users WHERE email = 'localadmin@example.test';
```

관리자 계정으로 로그인한 뒤 `/api/auth/me`의 `role`이 `admin`인지 확인합니다. 일반 사용자 계정도 남겨 권한 거절을 검증합니다. **이 SQL은 로컬 테스트 준비용이며 운영 권한 부여 절차가 아닙니다.**

## 문제 해결

| 증상 | 먼저 확인할 것 |
| --- | --- |
| `Access denied` / `Unknown database` | `.env`의 DB 계정·비밀번호·DB 이름, 셸에 남은 `DB_*`, 로컬 DB 준비 여부 |
| 테이블·컬럼이 없다는 오류 | 새 DB에 현재 `schema.sql`을 적용했는지 확인. 기존 DB라면 필요한 마이그레이션만 검토 |
| Redis 연결 오류 | 컨테이너 상태, 6380 포트, `REDIS_PASSWORD`. 연결 실패 후에는 Redis를 준비하고 BE도 재시작 |
| 로그인 후에도 401 | 로컬 HTTP에서 `NODE_ENV=production`으로 실행하지 않았는지, 같은 세션 쿠키를 보내는지 확인 |
| `EADDRINUSE` | 이미 같은 포트의 서버가 있는지 확인하고 `PORT` 변경 시 요청 주소도 함께 변경 |
| DB 테스트가 실행 조건에서 중단 | `.env.test.local`, loopback 호스트, 리뷰·타임존의 명시적 실행 변수 확인 |

이 문서는 로컬 개발 환경만 다룹니다. 운영 DB 변경과 배포 절차는 배포 담당자에게 별도로 확인합니다.


## 실행 확인 체크리스트

- [ ] `.env`의 DB·Redis가 로컬 인스턴스를 가리킨다.
- [ ] MySQL 접속과 시간대 확인, Redis `PONG` 확인을 마쳤다.
- [ ] `/api/health`와 `/api/products`가 200을 반환한다.
- [ ] 로컬 계정으로 로그인한 뒤 같은 쿠키로 `/api/auth/me`를 조회할 수 있다.
- [ ] 관리자 기능을 검증한다면 별도 관리자 계정을 준비했다.

## 문서 구성 참고

- [Outline — Local development](https://docs.getoutline.com/s/hosting/doc/local-development-5hEhFRXow7): 준비물 → 환경 설정 → 실행 순서와 앱/의존 서비스 구분 참고.
- [Node.js — Contributing](https://github.com/nodejs/node/blob/main/CONTRIBUTING.md): 진입 문서에서 목적별 상세 문서로 연결하는 구성 참고.

참고한 것은 안내 구조이며, 버전·명령·환경변수는 이 저장소의 설정을 기준으로 작성했습니다. 다른 프로젝트의 DB나 실행 자동화를 가져온 것은 아닙니다.
