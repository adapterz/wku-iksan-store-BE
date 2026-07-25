# DB 작업 일지 (DEVLOG)

## [2026-07-24] users.nickname 대소문자 비구분(case-insensitive) collation 통일

### 1. 배경 및 사전 확인
- 목표는 `users.nickname`이 대소문자 구분 없이 중복 체크되도록 collation을 통일하는 것이었습니다 ("abc"와 "ABC"를 같은 값으로 취급).
- 작업 착수 전 로컬 DB(`iksanshop`)를 확인한 결과, `nickname` 컬럼은 이미 `utf8mb4_unicode_ci`(대소문자 비구분) collation이 적용되어 있었고, `uq_users_nickname` UNIQUE 제약도 이미 대소문자를 무시하고 중복을 차단하고 있었습니다.
  - 검증: `SELECT 'abc' = 'ABC' COLLATE utf8mb4_unicode_ci` 실행 결과 `1`.
  - 검증: `zzzCiTest` 삽입 후 `ZZZCITEST`로 재삽입을 시도하니 `ERROR 1062 Duplicate entry`로 차단되었습니다.
- 따라서 로컬 기준으로는 "case-sensitive → case-insensitive 전환"이 아니라, 환경별로 다를 수 있는 collation을 명시적으로 통일하는 작업으로 범위를 조정해 진행했습니다 (운영 DB 등 다른 환경은 collation이 다를 수 있음).
- 중복 데이터 확인 쿼리(`SELECT LOWER(nickname), COUNT(*) FROM users GROUP BY LOWER(nickname) HAVING COUNT(*) > 1;`)를 실행한 결과, 대소문자만 다른 중복 닉네임은 없음을 확인했습니다.

### 2. 조치 내용
- `db/schema.sql`의 `nickname` 컬럼 정의에 `COLLATE utf8mb4_0900_ai_ci`를 명시했습니다 (신규 환경 구축 시 기준).
- 기존 DB에 적용할 `db/migrate_nickname_collation.sql`을 신규 작성했습니다. 핵심 구문은 `ALTER TABLE users MODIFY COLUMN nickname VARCHAR(50) COLLATE utf8mb4_0900_ai_ci NOT NULL;`이며, `uq_users_nickname` UNIQUE 제약과 NOT NULL 제약은 `MODIFY COLUMN` 특성상 그대로 유지됩니다 (`SHOW INDEX FROM users`로 재확인).
- 로컬 DB에 마이그레이션을 적용한 뒤 `SHOW CREATE TABLE users`로 `nickname` 컬럼 collation이 `utf8mb4_0900_ai_ci`로 바뀐 것을 확인했습니다.
- 대소문자만 다른 닉네임(`caseCheck` / `CASECHECK`) 삽입을 시도해 UNIQUE 제약 위반으로 정상 차단됨을 확인했습니다.
- 로컬 서버를 기동해 API 회귀 테스트를 진행했습니다 (테스트 후 데이터와 서버 프로세스는 모두 정리했습니다).
  - `POST /api/auth/signup`(nickname: `abc`) → `201 SIGNUP_SUCCESS`
  - `POST /api/auth/signup`(다른 이메일, nickname: `ABC`) → `409 NICKNAME_ALREADY_EXISTS` (대소문자만 다른 닉네임 정상 차단)
  - `POST /api/auth/login` → `200 LOGIN_SUCCESS`, `GET /api/auth/me` → `200 SESSION_VALID`
  - `GET /api/users/search?nickname=ABC` → `200 USER_SEARCH_SUCCESS`, `abc` 유저 조회 성공 (대소문자 비구분 검색 확인)
- 기존 FE/BE 로직과 API 스펙은 변경하지 않았습니다 (순수 DB collation 변경).

### 3. 운영 반영 안내 (주의 사항)
- **운영 DB에는 이 마이그레이션을 아직 적용하지 않았습니다.** 운영 반영 전 아래를 반드시 먼저 수행해야 합니다.
  1. 운영 DB 백업을 먼저 수행합니다 (백업 절차는 이번 작업 범위에 포함하지 않았으며, 팀 검증 후 별도로 진행합니다).
  2. 운영 DB에서도 `SELECT LOWER(nickname), COUNT(*) FROM users GROUP BY LOWER(nickname) HAVING COUNT(*) > 1;`로 대소문자만 다른 중복 닉네임 존재 여부를 재확인합니다 (로컬과 데이터가 다를 수 있음).
  3. 중복이 있다면 임의로 수정하지 말고 처리 방침을 팀과 먼저 결정한 뒤 진행합니다.
  4. 문제가 없음을 확인한 뒤 `db/migrate_nickname_collation.sql`을 운영 DB에 적용합니다.

## [2026-07-09] products 테이블 데이터 중복 및 인코딩 깨짐 해결

### 1. 발생 원인
- `seed.sql` 파일을 실행하기 위해 cmd 리다이렉션(`<`)이나 PowerShell 파이프 등 다양한 방식을 시도하면서 한글 인코딩 깨짐(`???`) 현상이 발생했습니다.
- 오류와 성공이 반복되는 과정에서 이전 데이터가 지워지지 않고 중첩 삽입되어 데이터 중복(15개 상품이 반복 삽입) 문제가 발생했습니다.
- 특히 `seed.sql` 32번째 줄 끝에 쉼표(`,`)가 들어가야 할 자리에 세미콜론(`;`)이 잘못 작성되어 있어, 뒷부분의 데이터 삽입이 구문 오류(Syntax Error)로 처리되며 일부만 성공했던 것도 데이터 꼬임의 핵심 원인이었습니다.

### 2. 조치 내용
- `seed.sql` 32번 라인의 세미콜론(`;`) 오타를 쉼표(`,`)로 수정했습니다.
- DB에 직접 접속하여 꼬여버린 데이터를 완전히 비웠습니다 (`DELETE FROM products;`). (`TRUNCATE TABLE`은 FK 제약 조건 위배로 사용 불가하여 `DELETE` 명령문으로 갈음)
- MySQL 콘솔 내에서 `SOURCE` 명령어를 사용하여 `db/seed.sql` 파일을 한 번만 재실행했습니다.
- 결과 검증: 18개(수정 후 정상 개수)의 상품이 중복 및 한글 깨짐 없이 올바르게 삽입된 것을 DB `SELECT` 및 API 테스트(`GET /api/products`)를 통해 확인했습니다.

### 3. 재발 방지 (주의 사항)
- **`seed.sql` 등 스크립트 실행 시 외부 cmd나 PowerShell 파이프/리다이렉션 사용 금지**. 반드시 MySQL 터미널 내에서 `SOURCE <파일경로>` 방식으로 실행하여 인코딩 유실을 방지합니다.
- 대량 데이터 삽입 시, 사전에 파일 내 오타(`;` 구문 종결자 위치 등) 유무를 철저히 점검합니다.
