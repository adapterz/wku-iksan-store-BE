# 테스트 가이드

명령은 BE 저장소 루트에서 실행합니다. 먼저 `npm ci`로 의존성을 설치하세요.
로컬 환경 준비는 [개발 환경 안내](DEVELOPMENT.md)를 참고합니다.

| 구분 | 목적 | 필요한 환경 |
| --- | --- | --- |
| Jest | 컨트롤러·모델·라우터의 자동 회귀 검증 | Node.js 24, npm 의존성 |
| 개발 도구 회귀 | 의존성 소비 경로·Node.js watch 동작 | Node.js 24, npm 의존성. DB 연결 불필요 |
| DB 테스트 | 실제 SQL·트랜잭션·DB 연동 동작 검증 | 별도 로컬 MySQL 및 임시 DB 생성·삭제 권한 |
| 화면·배포 검증 | 쿠키·FE 연동·배포 환경 확인 | FE/BE 실행 환경과 별도 검증 기록 |

## 1. Jest 테스트

```bash
npm test -- --runInBand
```

`archive/tests`의 Jest 테스트를 실행합니다. CI는 `npm test`를 사용합니다. 아래 실제 DB 테스트와 별개이며, 이 결과만으로 브라우저·운영 배포 검증이 끝난 것은 아닙니다.

### 개발용 의존성·watch 점검

```bash
npm run test:dev-security
npm run test:dev-watch
npm audit --omit=dev
npm audit
```

보안 스크립트는 패키지 버전과 실제 소비 경로를, watch 스크립트는 임시 파일·프로세스로 재시작과 종료를 확인합니다. DB나 운영 서버에는 연결하지 않습니다. PR CI는 Linux 전체 Jest와 Windows·Linux·macOS watch 점검을 실행합니다. 전체 audit에는 보류 중인 deepmerge가 남아 있으므로 0건을 기대하지 않습니다. 상세 범위와 보류 기준은 [의존성 보안 기록](DEV_DEPENDENCY_SECURITY.md)을 참고합니다.

## 2. MySQL 연동 테스트

**운영 서버나 운영 DB 터널에는 실행하지 않습니다.** 호스트가 `127.0.0.1`이어도 운영 DB로 연결되는 터널이면 안 됩니다.

- 스크립트가 임의 이름의 임시 DB를 만들고 정리 과정에서 삭제합니다. 준비한 로컬 MySQL에 **DB 생성·삭제 및 테이블 생성·변경·데이터 조작 권한**이 있는 테스트용 계정이 필요합니다. 개발 환경 안내의 앱용 `wku_local` 계정 권한만으로는 실행할 수 없습니다.
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



## 3. 교환권 취소 회귀 테스트

취소 기능은 다음 Jest 테스트로 별도 확인할 수 있습니다.

```bash
npm test -- --runInBand archive/tests/routes/gifts.test.js archive/tests/models/giftTransition.test.js archive/tests/models/giftModel.test.js archive/tests/routes/giftNotifications.test.js archive/tests/models/giftNotifications.test.js
```

DB 모킹 기반 테스트이며, `package.json`에 취소 전용 실제 DB 테스트 명령은 아직 없습니다.
실제 DB·브라우저 확인 항목 및 알려진 표시 문제는 [교환권 취소](GIFT_CANCELLATION.md#검증-방법)를 참고합니다.

## 4. 결과 기록 기준

검증 기록은 `날짜 / 검증 범위 / 기준 커밋·환경·명령 / 결과 / 미확인 사항` 순서로 남깁니다.
Jest 통과, 실제 DB 테스트 통과, 브라우저 확인, 운영 배포 확인을 서로 구분합니다.

### 2026-11-12–14 의존성 보안 패치 검증

| 검증 범위 | 기준·결과 | 경계 |
| --- | --- | --- |
| 격리 로컬 설치·회귀 | Node.js 24.11.1 / npm 11.6.2. 새 설치·전체 Jest·커버리지 각각 54 suites·889 tests, 보안 회귀 20건, watch 6건 통과 | 실제 DB·운영 사용자 흐름 검증은 아님 |
| PR CI | [#163 최종 실행](https://github.com/adapterz/wku-iksan-store-BE/actions/runs/43396101865): Linux 전체 테스트 및 Windows·Linux·macOS watch 통과 | 해당 커밋의 자동 테스트 결과 |
| 배포·운영 조회 | main `fd03aea`, [11/13 배포 성공](https://github.com/adapterz/wku-iksan-store-BE/actions/runs/43418283339), 읽기 전용 점검 33건 및 재점검 통과 | 운영 구매·취소·브라우저·부하 테스트는 제외 |
| 운영 설치 버전 | [11/14 Bio 확인](https://github.com/adapterz/wku-iksan-store-BE/issues/160#issuecomment-6875366369)의 컨테이너 패키지 7종이 배포 lock과 일치 | 담당자가 공유한 실행 중 컨테이너 확인 결과 |
| 잔여 경고 | 패치 검증 환경의 운영 audit 0건. 11/14 GitHub 열린 경고 deepmerge Low 1건 | 전체 audit의 Low 5개 영향 패키지와 GitHub 경고 개수는 다름. deepmerge 해결 완료 아님 |

위 결과로 #160을 마감했고 잔여 항목은 #158에서 관리합니다. 이번 문서 편집 중 위 운영 테스트를 다시 실행한 것은 아닙니다.

### 2026-11-11 문서 일관성 검토

| 검증 범위 | 기준·결과 | 경계 |
| --- | --- | --- |
| BE 전체 Jest | `develop 3b59864`에 문서 수정만 적용 / Node.js v24.11.1·기존 로컬 의존성 / `npm test -- --runInBand` / 54개 suite·889개 test 통과 | 실제 DB·브라우저·운영 재검증 아님 |
| 문서 연결·명령 | 프로젝트 Markdown 전체의 로컬 파일·제목 링크, npm 스크립트 이름 대조 | 모든 외부 웹페이지의 접속 성공을 보장하는 검사는 아님 |
| API·스키마 구조 | API v2의 명시된 HTTP 경로를 라우터와, ERD v2의 14개 테이블 컬럼명·명명된 제약을 `schema.sql`과 대조 | 경로·구조 대조이며 모든 응답·SQL의 동적 검증을 대체하지 않음 |

검토 중 미해결 사항은 [마무리 기록](CLOSEOUT.md)과 #158에 구분했습니다. 운영 DB·SQL·제품 코드는 변경하지 않았습니다.

### 2026-11-09 마무리 문서 대조 시 검증

| 날짜 | 검증 범위 | 기준 커밋·환경·명령 | 결과 | 미확인 사항 |
| --- | --- | --- | --- | --- |
| 11/9 | BE 전체 Jest | 구현 `develop c581069`, 문서 `f9071b2` 이후 설명 보완 / Node.js v24.11.1·기존 로컬 의존성 / `npm test -- --runInBand` | 54개 suite·889개 test 통과 | 실제 DB·브라우저·운영 환경 재검증은 아님 |
| 11/9 | 취소 관련 선행 회귀 | 같은 구현 기준 / 위 3장의 5개 Jest 파일 | 5개 suite·70개 test 통과. 전체 889개에 포함, 합산하지 않음 | 실제 DB 잠금 경합 검증은 아님 |
| 11/7 | DB 적용 공유·운영 화면 | 배포 PR·담당자·확인 항목은 [교환권 취소 기록](GIFT_CANCELLATION.md#배포-확인-및-알려진-사항) 참조 | 담당자 완료 공유 및 팀의 취소·내역 등 확인 기록 | 문서 갱신 중 DB·운영 테스트를 재실행하지 않음 |

이 결과와 기존 PR의 DB 검증 기록은 환경·시점을 구분합니다. 전체 운영 QA 완료를 의미하지 않습니다.
팀 공용 현황은 [BE 구현 현황 및 마무리 기록](https://github.com/adapterz/wku-iksan-store-BE/wiki/BE-구현-현황-및-마무리-기록)에 정리합니다. [#126](https://github.com/adapterz/wku-iksan-store-BE/issues/126)은 Ethan의 별도 확인·해결 공유를 근거로 검증 작업을 마감했으며 과거 확인 방법·미확인 칸은 보존합니다. 새로 발견하거나 이관한 보완점은 [#158](https://github.com/adapterz/wku-iksan-store-BE/issues/158)에 연결합니다. 이슈 마감만으로 위 검증의 환경·범위가 확대되지는 않습니다.

### 이전 확인 기록

이 안내 보완 시 확인한 범위(2026-10-27):

- `develop` 기준 `09207d3`, Node.js `v24.11.1`의 기존 로컬 의존성 환경에서 Jest **53개 suite / 862개 test 통과**.
- 문서의 파일 링크·npm 스크립트·가입 예제의 입력 검증 확인.
- **새 환경에서 `npm ci`부터 MySQL·Redis 준비까지 전체 재현한 결과는 아님.** Docker 엔진 미실행으로 신규 환경 전체 재현은 미확인.
- 문서 변경만으로 운영 DB·서버 설정이나 배포 상태가 바뀌지 않습니다.
