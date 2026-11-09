# 미사용 교환권 취소

구현 기준: develop `c581069` · [설계 #153](https://github.com/adapterz/wku-iksan-store-BE/issues/153) · [BE PR #154](https://github.com/adapterz/wku-iksan-store-BE/pull/154).

## 기능 범위

**실제로 교환권을 사용하는 수신자가 미사용 교환권을 취소합니다.** 타인에게 받은 선물과 나에게 선물 모두 해당합니다.

- 취소는 교환권 ID 기준이며, 같은 주문 그룹의 다른 교환권은 유지합니다.
- 취소한 교환권은 다시 사용하거나 복구할 수 없습니다. 사용 완료 교환권은 취소할 수 없습니다.
- Mock 결제 상태를 변경하는 기능입니다. 실제 금전 환불, 구매자 주문 전체 취소 화면, 발신자 취소 알림은 포함하지 않습니다.
- 유효기간 만료 판정·자동 취소는 포함하지 않습니다.

## API

모든 경로는 로그인 필요, 응답은 `private, no-store`입니다.

| 요청 | 동작 |
| --- | --- |
| `PATCH /api/gifts/:id/cancel` | 본문 없이 수신자 본인의 `paid` + `unused` 교환권 취소 |
| `GET /api/gifts?status=cancelled` | 주문·교환권이 모두 `cancelled`인 본인 수신 내역 조회 |
| `GET /api/gifts/:id` | 취소 상태도 조회 가능. `barcode: null`, `canReview: false`, `cancelledAt` 반환 |
| `GET /api/gifts` | 상태 생략 시 결제 완료인 미사용·사용 완료만 반환. 취소 건은 별도 조회 |

취소 성공은 HTTP 200, `code: GIFT_CANCEL_SUCCESS`, `data: { giftId, status: "cancelled", cancelledAt }`입니다.
같은 수신자가 정상 취소된 건을 재요청하면 최초 취소 시각을 그대로 반환합니다. 목록에도 `cancelledAt`이 포함되며 미취소 건은 `null`입니다.
날짜 직렬화 기준은 [DB 시간대](DATABASE_TIMEZONE.md)를 따릅니다.

| 실패 조건 | HTTP / 코드 |
| --- | --- |
| 비로그인·세션 만료 | 401 `UNAUTHORIZED` |
| 잘못된 교환권 ID | 400 `INVALID_GIFT_ID` |
| 없는 교환권 | 404 `GIFT_NOT_FOUND` |
| 다른 사람의 교환권 | 403 `FORBIDDEN_NOT_OWNER` |
| 사용 완료 | 409 `GIFT_ALREADY_USED` |
| 미결제·취소 정보 불일치 등 취소 불가 | 409 `GIFT_NOT_CANCELLABLE` |
| 취소된 교환권의 사용 요청 | 409 `GIFT_CANCELLED` |

## BE 처리·DB 변경

| 파일 | 역할 |
| --- | --- |
| `routes/gifts.js` | 취소 경로, 로그인·캐시 금지 미들웨어 연결 |
| `controllers/giftsController.js` | ID 검증, 오류·성공 응답, 취소 내역·바코드 비노출 |
| `db/models/giftModel.js` | 수신자·교환권/주문 잠금, 사용·취소 상태 전환, 목록·알림 대상 구분 |
| `db/models/cartTransaction.js` | 트랜잭션·회원 잠금 공통 처리 |
| `constants/responseCodes.js` | 취소 성공 및 상태 충돌 오류 코드 |

수신자 회원 행을 먼저 잠근 뒤 교환권·주문을 잠그고 최신 상태를 확인합니다. 사용·취소·탈퇴가 경합할 때 같은 잠금 순서를 사용합니다.
취소 시 개별 `orders.payment_status`와 `gifts.status`를 함께 변경하고 `gifts.cancelled_at`을 저장합니다. 중간 실패는 롤백합니다.
그룹의 최초 `total_price`·`payment_status`, 다른 주문·교환권은 변경하지 않습니다.

DB 변경은 [migrate_gift_cancellation.sql](../../db/migrate_gift_cancellation.sql)의 `gifts.cancelled_at DATETIME NULL` 추가입니다.
기존 데이터 백필·seed 재실행은 필요하지 않습니다. 이미 컬럼이 있으면 SQL을 다시 실행하지 않습니다.
빈 DB용 [schema.sql](../../db/schema.sql)에는 반영되어 있습니다. 문서 확인과 운영 적용 완료는 별도로 구분합니다.

취소 건은 미사용 보유 수·탈퇴 시 미사용 검사·새 선물 도착 알림에서 제외합니다.
알림 조회 직후 취소된 ID를 확인 요청에 포함하더라도 정상 선물의 확인을 막지 않으며, 취소 건의 확인 시각은 변경하지 않습니다([도착 알림](GIFT_NOTIFICATIONS.md)).

## 검증 방법

### 저장소 자동 테스트

```bash
npm test -- --runInBand archive/tests/routes/gifts.test.js archive/tests/models/giftTransition.test.js archive/tests/models/giftModel.test.js archive/tests/routes/giftNotifications.test.js archive/tests/models/giftNotifications.test.js
```

소유권·취소 내역·바코드 비노출, 최초 취소 시각 유지, 사용 거절, 주문/교환권 변경 및 롤백, 알림 대상을 검증합니다.
이 테스트는 DB 모킹을 사용합니다. **현재 `package.json`에는 교환권 취소 전용 실제 DB 테스트 명령이 없습니다.** 실제 DB 잠금 경합을 다시 확인하려면 격리된 로컬 MySQL에서 별도 검증하고 결과를 기록합니다. 다른 기능의 DB 테스트를 취소 검증으로 대체하지 않습니다.

### 화면·실제 DB 확인

운영에서는 승인된 테스트 계정·교환권만 사용합니다. 취소 확정은 되돌릴 수 없습니다.

- 확인창 닫기: 취소하지 않고 목록을 유지한다.
- 본인 수신 미사용 교환권 취소: 미사용 목록·개수에서 빠지고 취소 내역과 취소일이 표시된다.
- 취소 상세: 바코드·사용 버튼을 제공하지 않고 취소 안내를 표시한다.
- 로컬 DB 검증: 재취소의 시각 유지, 타인·사용 완료 거절, 동일 그룹의 다른 교환권·최초 금액 유지, 사용/취소 동시 요청의 최종 상태를 확인한다.

## 배포 확인 및 알려진 사항

2026-11-07 팀 확인 기록 기준:

- Bio가 마이그레이션 완료를 공유한 뒤 [BE #156](https://github.com/adapterz/wku-iksan-store-BE/pull/156), [FE #129](https://github.com/adapterz/wku-iksan-store-FE/pull/129)로 배포했습니다. 이 기록은 DB 직접 재조회 결과가 아닌 담당자 완료 공유 기준입니다.
- Ethan이 운영 사이트에서 취소·취소 내역 표시를 확인했습니다.
- Aon이 운영 교환권 1건의 취소, 취소 내역, 바코드 숨김, 마이페이지 개수를 확인했습니다. 모든 경계 조건을 운영에서 재검증했다는 의미는 아닙니다.

**알려진 표시 문제:** 취소 교환권 상세에서 상단 이름 자리에 `오류`가 표시됩니다. 기존 FE `giftuse.js`의 `showError()`를 취소 안내에도 사용하기 때문입니다.
본문의 “취소된 교환권이라 사용할 수 없습니다” 안내와 사용 차단은 정상 동작입니다. 팀 논의에 따라 이번에는 표시 문제로 기록하고, 해당 문구만을 위한 재배포는 진행하지 않습니다.
후속 FE 보완 시 취소 상태 안내와 실제 조회 오류의 제목을 구분할 수 있습니다.
