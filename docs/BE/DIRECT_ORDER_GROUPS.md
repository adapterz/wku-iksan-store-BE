# 즉시 구매 그룹 주문 — BE #125

## 범위

- 상품 상세에서 바로 구매할 때도 **수량 1~10개 모두 그룹 방식**으로 처리한다.
- 기존 `POST /api/orders` 요청·응답 및 장바구니 `POST /api/order-groups`는 유지한다.
- 즉시 구매는 장바구니를 조회·추가·수정·삭제하지 않는다. 그룹 저장·조회 구조만 공유한다.
- FE 화면 변경, 운영 DB 적용, 배포는 포함하지 않는다. 실제 결제 연동이 아닌 기존 mock 주문의 `paid` 처리다.

## 생성 API

`POST /api/order-groups/direct` — 로그인 필요, `Cache-Control: private, no-store`

헤더: `Idempotency-Key: <16~64자 영문·숫자·_·->` (예: `crypto.randomUUID()` 결과)

```json
{
  "productId": 3,
  "quantity": 2,
  "expectedUnitPrice": 1000,
  "isSelfGift": false,
  "receiverId": 2,
  "message": "선물입니다"
}
```

| 필드 | 조건 |
| --- | --- |
| productId | 양의 안전한 정수, 문자열 불가 |
| quantity | 필수 정수 1~10, 문자열 불가. 신규 API는 생략 시 1로 간주하지 않음 |
| expectedUnitPrice | 결제 화면에서 확인한 1개 가격. 필수 정수 1~2,147,483,647 |
| isSelfGift | 필수 boolean |
| receiverId | 타인 선물이면 필수 양의 정수이며 본인 불가. 자기 선물은 생략하거나 본인 ID만 허용 |
| message | 선택 문자열/null. 양쪽 공백 제거 후 Unicode 코드 포인트 500자 이내 |

발신자는 세션에서 정한다. `userId`, `cartItemId`, `version` 등 명시되지 않은 필드는 거부한다.
`expectedUnitPrice`는 가격 변경 감지용이지 신뢰하는 결제 금액이 아니다. 잠금 안에서 DB의 판매 상태·가격을 확인하고 서버 가격 × 수량으로 총액을 계산한다.

### 응답

기존 그룹 주문과 같은 `201 ORDER_GROUP_CREATE_SUCCESS` 응답을 사용한다. 성공한 동일 요청의 재시도도 201과 기존 그룹 결과를 반환한다.

```json
{
  "status": 201,
  "code": "ORDER_GROUP_CREATE_SUCCESS",
  "message": null,
  "data": {
    "orderGroupId": 10,
    "sender": { "userId": 1, "nickname": "보낸 사람" },
    "receiver": { "userId": 2, "nickname": "받는 사람" },
    "isSelfGift": false,
    "message": "선물입니다",
    "totalPrice": 2000,
    "totalQuantity": 2,
    "paymentStatus": "paid",
    "createdAt": "2026-09-18T09:00:00.000Z",
    "items": [{
      "productId": 3,
      "name": "상품명",
      "brand": "브랜드",
      "thumbnailUrl": null,
      "quantity": 2,
      "unitPrice": 1000,
      "subtotal": 2000,
      "units": [{ "orderId": 100, "giftId": 200 }, { "orderId": 101, "giftId": 201 }]
    }]
  }
}
```

키·요청 해시·바코드는 응답에 포함하지 않는다. 소유자 확인 및 완료 화면 재조회는 기존 `GET /api/order-groups/:id`를 사용한다. 다른 회원의 그룹은 404다.
그룹 조회 응답은 기존 계약대로이며 `validPeriod` 등의 신규 상품 상세 필드는 이번에 추가하지 않는다.

## 중복 방지·트랜잭션

1. FE는 새 주문 제출 시 키를 발급하고 요청 내용과 함께 보관한다. 네트워크 실패·새로고침 후 같은 주문 재시도에서는 같은 키와 내용을 유지한다.
2. BE는 정규화한 상품·수량·예상 단가·선물 유형·수신자·메시지와 `source: direct`로 해시를 계산한다. 키 공간은 회원별로 장바구니 주문과 공유하지만 서로 다른 경로의 키 재사용은 충돌로 처리한다.
3. 회원을 ID 오름차순으로 잠근 뒤 기존 요청을 재조회한다. 신규 요청이면 상품을 잠그고 검증한다.
4. 그룹 1개 + 수량만큼 주문·교환권을 같은 트랜잭션에서 생성한다. 일부 실패 시 전부 롤백한다.
5. 성공 주문은 이후 가격·판매 상태가 바뀌거나 수신자가 탈퇴해도 같은 키로 기존 결과를 복원한다. 신규 주문에는 현재 상태를 검증한다.

동일 내용이라도 **다른 키는 별개의 주문**이다. 성공 여부가 불명확할 때 FE가 임의로 새 키를 발급하면 중복 방지할 수 없다. 먼저 기존 키로 결과를 확인한 후, 명확한 새 주문에 새 키를 사용한다.
DB deadlock은 기존 트랜잭션 유틸리티로 최대 3회 시도한다. COMMIT 응답 유실·네트워크 오류는 BE에서 자동 재실행하지 않는다.

## 오류 코드

| HTTP | 코드 | 의미 |
| --- | --- | --- |
| 400 | INVALID_IDEMPOTENCY_KEY | 키 누락/형식 오류 |
| 400 | INVALID_DIRECT_ORDER_BODY | 필수값·자료형·알 수 없는 필드 오류 |
| 400 | INVALID_QUANTITY | 수량 누락, 0·음수·소수·문자열 등 |
| 400 | ORDER_QUANTITY_EXCEEDED | 상품당 최대 수량 초과 |
| 400 | CANNOT_GIFT_TO_SELF | 타인 선물로 본인 지정 |
| 401 | UNAUTHORIZED | 로그인 필요/무효 세션 |
| 404 | PRODUCT_NOT_FOUND / RECEIVER_NOT_FOUND | 상품/수신자 없음 |
| 409 | PRODUCT_UNAVAILABLE | 숨김·단종 상품 |
| 409 | PRODUCT_PRICE_CHANGED | 화면 예상 가격과 서버 가격 불일치 |
| 409 | INVALID_PRODUCT_PRICE | 서버 가격 자체가 허용 범위 밖 |
| 409 | IDEMPOTENCY_KEY_REUSED | 동일 키로 다른 주문 요청 |
| 409 | CART_BUSY | 기존 공통 코드 재사용: 잠금 시간 초과/재시도 소진 |
| 500 | 기존 공통 서버 오류 | 생성 실패. 성공 여부 불명확하면 동일 키로 재확인 |

## FE 연동 체크

- bottom-sheet 수량을 결제 화면에 전달하고 수량·총액 표시.
- 수량 1개도 `/api/order-groups/direct` 사용. 기존 단건 API는 레거시 호출 호환용.
- 화면의 단가와 수신자·메시지, 키를 요청과 함께 보관. 가격 변경 오류면 최신 가격을 보여주고 재확인받는다.
- 완료 화면은 `orderGroupId`로 조회하고 전체 수량·총액을 표시. `units[0]`만 기존 완료 화면에 넘기지 않는다.
- 키/요청 보관 데이터는 계정별 분리하고 로그아웃·계정 전환 시 다른 계정에서 재사용하지 않는다.
- 이번 BE 구현만으로 FE 화면 연동 완료로 간주하지 않는다.

## DB·배포

새 테이블/컬럼/마이그레이션은 없다. 기존 장바구니의 `order_groups`, 주문 그룹 연결·스냅샷 컬럼, 바코드 UNIQUE 제약이 적용돼 있어야 한다. 운영 적용 여부는 이 문서에서 보장하지 않는다.
BE 신규 경로 배포 후 FE 전환이 가능하며, BE만 먼저 반영해도 기존 호출 형식은 유지된다.

## 검증 실행

```text
npm test -- --runInBand
npm run test:direct-orders:db -- <로컬 DB 접속 설정 파일>
npm run test:cart:db -- <로컬 DB 접속 설정 파일>
```

DB 스크립트는 loopback 주소만 허용하고, 무작위 임시 DB를 생성한 뒤 삭제한다. 지정한 `DB_NAME`은 사용하지 않는다. Redis는 스크립트 내부에서 격리한다. 운영 자격 증명을 사용하지 않는다.
검증 항목: 수량·키·권한·가격/판매 상태 검증, 동일 키 동시 주문, 키 충돌, 장바구니 불변/기존 결제, 전체 롤백, 바코드 충돌, 그룹 재조회, 개별 사용·리뷰, 기존 단건 응답 호환.

### 로컬 검증 결과 (2026-09-18)

- develop `eace31e` 기반 구현, Jest **50개 스위트 / 782건 통과**.
- 격리한 MySQL 8.0.46: 즉시 구매 DB 검사 **55건**, 기존 장바구니 DB 회귀 검사 **54건 통과**.
- DB 검사의 `ER_SIGNAL_EXCEPTION`, `ER_DUP_ENTRY` 로그는 강제 실패·바코드 충돌 검증용이며 전체 롤백을 확인했다.
- FE 브라우저 연동·운영 DB 적용·운영 배포는 실행하지 않았다.
