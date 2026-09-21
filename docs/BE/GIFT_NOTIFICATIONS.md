# 선물 도착 알림 API

기준: [선물 도착 알림 설계 이슈 #101](https://github.com/adapterz/wku-iksan-store-BE/issues/101).
합의한 API 경로, `giftIds`, `gifts.notified_at`을 그대로 사용합니다.
개별 읽음·NEW 표시·실시간 푸시·모달 UI는 이번 BE 변경에 포함하지 않습니다.

## 1. 조회

`GET /api/gifts/unnotified` — 기존 세션 로그인 필수, `Cache-Control: private, no-store`.

```json
{
  "status": 200,
  "code": "GIFT_UNNOTIFIED_SUCCESS",
  "message": null,
  "data": { "count": 2, "giftIds": [51, 52] }
}
```

본인 수신, `is_self_gift = false`, `payment_status = 'paid'`, `notified_at IS NULL`을 모두 만족하는 ID를 오름차순으로 반환합니다.
ID와 개수는 한 번의 조회 결과에서 계산하며, 대상이 없으면 `count: 0`, `giftIds: []`입니다. 조회 자체는 확인 시각을 변경하지 않습니다.
사용 완료 여부나 발신자의 탈퇴 여부는 알림 제외 조건이 아닙니다.

## 2. 확인 처리

`PATCH /api/gifts/notify` — 기존 세션 로그인 필수, 동일한 캐시 금지 헤더.

```json
{ "giftIds": [51, 52] }
```

```json
{
  "status": 200,
  "code": "GIFT_NOTIFY_SUCCESS",
  "message": null,
  "data": { "count": 2, "giftIds": [51, 52] }
}
```

- 요청으로 받은 ID만 처리합니다. 모달이 열린 사이 도착한 53번은 그대로 남습니다.
- 비어 있지 않은 JSON 숫자 배열이어야 하며, 각각 양의 안전 정수여야 합니다. 문자열 ID/소수/0/음수/null은 거부합니다.
- 중복 ID는 제거하고 오름차순으로 정리합니다. 요청 크기는 기존 `express.json()` 기본 제한(100KB)을 따릅니다. 조회가 이보다 커지는 규모에서는 FE 분할 요청 또는 별도 페이지 계약을 조율해야 합니다.
- 사용자 ID는 세션에서만 가져옵니다. 전달된 `userId`로 처리 대상을 바꿀 수 없습니다.
- 하나라도 존재하지 않거나 타인 수신·나에게 선물·미결제 등 부적격이면 전체 요청을 거부합니다. 타인의 존재 여부를 구분해서 노출하지 않습니다.
- 대상 확인과 갱신은 같은 연결의 트랜잭션 안에서 주문/선물 행을 잠그고 처리합니다.
- 이미 확인된 적격 선물도 성공합니다. `notified_at IS NULL`인 행만 변경하여 최초 시각을 유지합니다.
- 성공 응답의 `count`는 **이번에 새로 갱신한 건수가 아니라 확인 완료된 요청 ID 수**입니다. 같은 요청의 재시도에도 동일합니다.
- DB 오류가 발생하면 전체 롤백합니다. 사용 상태/사용 시각/리뷰 자격은 변경하지 않습니다.

| HTTP | code | 의미 |
| --- | --- | --- |
| 401 | UNAUTHORIZED | 로그인 필요 |
| 400 | INVALID_GIFT_IDS | 빈 배열, 잘못된 배열/ID 형식 |
| 404 | GIFT_NOTIFICATION_TARGET_NOT_FOUND | 요청 ID 중 부적격 대상 존재; 전체 미반영 |
| 500 | INTERNAL_SERVER_ERROR | 서버/DB 오류; 재시도 가능 |

오류도 기존 `{ status, code, message, data }` 형식입니다. 성공 확인 전 모달을 닫거나 선물함으로 이동하지 않습니다.
404이면 목록을 재조회해 대상을 갱신할 수 있고, 네트워크/서버 오류이면 같은 ID들로 재시도할 수 있습니다.

## 3. DB 및 운영 적용

- 신규 DB: [schema.sql](../../db/schema.sql).
- 기존 DB: [migrate_gift_notifications.sql](../../db/migrate_gift_notifications.sql).
- 기존 seed 전체를 재실행하지 않습니다. 기존 테이블 FK·사용 상태는 유지합니다.

적용 순서: **백업 → 선물 생성 중단·진행 중 요청 종료 확인 → 컬럼 추가·최초 백필 → BE 배포·API 확인 → 생성 재개·FE 연동 검증**.

백필은 최초 적용에만 실행합니다. 재실행하면 신규 미확인 선물이 사라집니다.
전체 파일도 재실행하지 않으며, SQL 오류를 무시하고 계속 실행하는 옵션을 사용하지 않습니다.
DDL은 자동 커밋되므로 중간 실패 시 생성 중단 상태를 유지한 채 실제 적용 상태를 확인해야 합니다.
코드만 이전 버전으로 복구해야 할 때는 컬럼을 유지할 수 있습니다. 확인 시각을 초기화하거나 컬럼을 즉시 제거하지 않습니다.

현재 구현·로컬 테스트 완료는 운영 DB 적용/배포 완료를 의미하지 않습니다.

## 4. 검증

```sh
npm test -- --runInBand
npm run test:gift-notifications:db -- /path/to/local-test.env
```

두 번째 명령은 localhost MySQL의 임의 테스트 DB를 생성하고 종료 시 삭제합니다. 지정한 환경 파일의 DB_NAME은 사용하지 않습니다.
CREATE/DROP DATABASE 권한이 필요하며 실제 회원·운영 DB에는 실행하지 않습니다.

실제 MySQL·HTTP 테스트 항목:

- 신규 schema / 기존 DB 마이그레이션 결과 일치, 기존 데이터 제외 및 신규 데이터 NULL
- 인증·캐시 금지, 수신자/결제/self 필터, 발신자 탈퇴·사용 완료 선물 처리
- 안내 후 신규 도착 선물 유지, 타인·없는 ID 혼합 시 전체 거부
- 재시도 시 최초 시각 유지, 겹치는 동시 확인 요청 성공
- DB 오류 시 부분 갱신 롤백, 오류 후 재시도
- 기존 선물 목록·상세·사용 API 정상 및 알림 시각 유지

실제 SQL을 실행하되 HTTP 인증에는 테스트 전용 세션을 주입합니다. 브라우저 로그인·FE 모달 연동·운영 환경 검증은 별도로 진행합니다.
