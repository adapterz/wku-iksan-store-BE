# 테스트 가이드

명령은 BE 저장소 루트에서 실행합니다. 먼저 `npm ci`로 의존성을 설치하세요.
로컬 환경 준비는 [개발 환경 안내](DEVELOPMENT.md)를 참고합니다.

| 구분 | 목적 | 필요한 환경 |
| --- | --- | --- |
| Jest | 컨트롤러·모델·라우터의 자동 회귀 검증 | Node.js 24, npm 의존성 |
| DB 테스트 | 실제 SQL·트랜잭션·DB 연동 동작 검증 | 별도 로컬 MySQL 및 임시 DB 생성·삭제 권한 |
| 화면·배포 검증 | 쿠키·FE 연동·배포 환경 확인 | FE/BE 실행 환경과 별도 검증 기록 |

## 1. Jest 테스트

```bash
npm test -- --runInBand
```

`archive/tests`의 Jest 테스트를 실행합니다. CI는 `npm test`를 사용합니다. 아래 실제 DB 테스트와 별개이며, 이 결과만으로 브라우저·운영 배포 검증이 끝난 것은 아닙니다.

## 2. MySQL 연동 테스트

**운영 서버나 운영 DB 터널에는 실행하지 않습니다.** 호스트가 `127.0.0.1`이어도 운영 DB로 연결되는 터널이면 안 됩니다.

- 스크립트가 임의 이름의 임시 DB를 만들고 정리 과정에서 삭제합니다. 준비한 로컬 MySQL에 **DB 생성·삭제 및 테이블 생성·변경·데이터 조작 권한**이 있는 테스트용 계정이 필요합니다. 위 앱용 `wku_local` 계정 권한만으로는 실행할 수 없습니다.
- `.env.test.local`을 만들고 아래 접속값만 채웁니다. 이 파일은 Git 제외 대상입니다. 기존 파일이 있으면 덮어쓰지 않습니다.
- `DB_NAME`은 테스트가 생성한 임시 이름으로 대체됩니다. 평소 개발 DB에 seed를 추가할 필요가 없습니다.
- 한 번에 하나씩 실행하고 실패 시 로그를 확인합니다. 강제 종료되면 임시 DB가 남을 수 있으므로 이름을 확인하지 않고 DB를 일괄 삭제하지 마세요.

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=로컬_DB_테스트용_계정
DB_PASSWORD=직접_설정한_비밀번호
```

### 기능별 실행 명령

| 스크립트 | 검증 대상 |
| --- | --- |
| `test:session:db` | 비밀번호 변경 및 세션 무효화 |
| `test:withdrawal:db` | 탈퇴와 단건·즉시 구매·장바구니 선물 주문의 동시 처리 |
| `test:cart:db` | 장바구니·주문 그룹 및 관련 마이그레이션 |
| `test:direct-orders:db` | 즉시 구매 주문 그룹 |
| `test:gift-notifications:db` | 선물 도착 알림 |
| `test:search-logs:db` | 검색 로그·인기 검색어 집계 |
| `test:reviews:db` | 리뷰·관련 제재·마이그레이션 |
| `test:timezone:db` | KST 날짜 변환과 기존 날짜 데이터 사례 |

다음 여섯 명령은 환경 파일을 **인자**로 받습니다.

```bash
npm run test:session:db -- .env.test.local
npm run test:withdrawal:db -- .env.test.local
npm run test:cart:db -- .env.test.local
npm run test:direct-orders:db -- .env.test.local
npm run test:gift-notifications:db -- .env.test.local
npm run test:search-logs:db -- .env.test.local
```

탈퇴 테스트는 실제 회원 행의 잠금 대기를 확인하기 위해 로컬 테스트 계정에
`performance_schema.data_locks`, `data_lock_waits`, `threads` 조회 권한이 필요합니다.
권한이 없는 환경에서는 검증을 건너뛰지 않고 실패합니다. 운영 계정 권한을 변경하지 말고
별도의 로컬 테스트 계정을 사용하세요. 검증 범위와 결과는 [탈퇴 동시성 보완](ACCOUNT_WITHDRAWAL.md)에 정리했습니다.

리뷰(`test:reviews:db`)·타임존(`test:timezone:db`) 테스트는 **추가 실행 동의 변수**가 필요합니다. 타임존은 아래에서 환경 파일을 읽기 위해 npm 스크립트와 같은 파일을 Node로 직접 실행합니다. 새 터미널에서 설정해 다른 작업의 환경변수와 섞지 않는 것을 권장합니다.

```powershell
# Windows PowerShell — 리뷰
$env:REVIEW_DB_TEST = '1'
$env:REVIEW_DB_ENV_FILE = '.env.test.local'
npm run test:reviews:db

# Windows PowerShell — 타임존 (Node 24의 --env-file로 접속값 로드)
$env:TIMEZONE_DB_TEST = '1'
node --env-file=.env.test.local scripts/test-timezone-db.js
```

```bash
# macOS / Linux
REVIEW_DB_TEST=1 REVIEW_DB_ENV_FILE=.env.test.local npm run test:reviews:db
TIMEZONE_DB_TEST=1 node --env-file=.env.test.local scripts/test-timezone-db.js
```

타임존 테스트는 UTC·Asia/Seoul 프로세스에서 각각 날짜 변환을 검증합니다. DB 테스트의 로컬 호스트 제한을 우회하거나 운영 접속정보를 넣지 마세요.



## 3. 결과 기록 기준

검증 기록에는 기준 커밋, 실행 명령, 환경, 성공·실패 결과와 미확인 범위를 남깁니다.
Jest 통과, 실제 DB 테스트 통과, 브라우저 확인, 운영 배포 확인을 서로 구분합니다.

이 안내 보완 시 확인한 범위(2026-10-27):

- `develop` 기준 `09207d3`, Node.js `v24.11.1`의 기존 로컬 의존성 환경에서 Jest **53개 suite / 862개 test 통과**.
- 문서의 파일 링크·npm 스크립트·가입 예제의 입력 검증 확인.
- **새 환경에서 `npm ci`부터 MySQL·Redis 준비까지 전체 재현한 결과는 아님.** Docker 엔진 미실행으로 신규 환경 전체 재현은 미확인.
- 문서 변경만으로 운영 DB·서버 설정이나 배포 상태가 바뀌지 않습니다.
