# 장바구니·묶음 주문 — 이슈 #94 구현 초안

관련: [장바구니 설계 #94](https://github.com/adapterz/wku-iksan-store-BE/issues/94). 최초 구현 기준은 develop `5a259b4`이며, PR 준비 시 develop `22d6fce`를 브랜치에 통합하고 재검증했습니다.

**로컬 구현·검증 단계입니다.** API·ERD 및 수량 제한에 대한 팀 검토를 거친 뒤 반영합니다. 코드 작성, develop 머지, 운영 DB 적용, main 배포는 각각 별도 단계입니다. Wiki나 운영 DB는 이 작업에서 수정하지 않았습니다.

## 1. 동작과 범위

1. 로그인한 회원이 상품을 담습니다. 같은 상품은 한 행의 수량으로 합칩니다.
2. 조회 시 현재 가격·판매 상태와 수정 버전(version)을 반환합니다. 선택 상태는 FE에서만 보관합니다.
3. 선택 상품, 받는 사람 한 명, 공통 메시지로 묶음 주문을 요청합니다.
4. 서버가 소유권·수량·버전·가격·판매 상태를 다시 확인합니다. 하나라도 달라지면 전체를 거부합니다.
5. 묶음 → 수량별 주문·교환권 발급 → 선택한 장바구니 삭제를 한 트랜잭션으로 처리합니다.
6. 완료 화면은 한 묶음으로, 받는 사람의 선물함은 개별 교환권으로 표시합니다.

예: 커피 2개 + 빵 1개 → order_groups 1건 / orders 3건 / gifts 3건. 각 교환권을 따로 사용하고 리뷰를 작성할 수 있습니다.

- 초안 제한: 장바구니 30종, 상품당 1~10개, 1회 주문 최대 50개. `constants/cart.js`에서 관리합니다.
- 찜과 장바구니는 독립적입니다. 숨김·단종 상품의 기존 장바구니 행은 남기되 `canOrder=false`로 주문을 막습니다.
- PG 결제 없이 기존 단건 주문처럼 `paid`로 생성하는 **데모 주문**입니다.
- 보낸 선물 목록, 상품별 다른 수신자, 배송·재고·취소·환불, 운영 정책 확정은 포함하지 않습니다.
- 기존 계정 삭제와 선물 생성 동시성 이슈 [#85](https://github.com/adapterz/wku-iksan-store-BE/issues/85)는 별도입니다. 새 주문에서 회원 행을 잠그는 것만으로 기존 삭제 경로의 사전 검사 경쟁까지 해결한 것은 아닙니다.

## 2. API

모두 세션 로그인 필요. 응답은 기존 `{ status, code, data }` 형식을 따릅니다. 개인정보 응답은 `Cache-Control: private, no-store`입니다.

| 메서드 | 경로 | 요청 / 응답 data |
| --- | --- | --- |
| GET | /api/cart-items | 장바구니 항목 배열 |
| POST | /api/cart-items | `{productId, quantity}` → 추가·합산된 항목, 201 |
| PATCH | /api/cart-items/:id | `{quantity, version}` → 수정된 항목, 200 |
| DELETE | /api/cart-items/:id | → `{itemIds:[id]}`, 200 |
| POST | /api/cart-items/remove | `{itemIds:[1,2]}` → 삭제한 IDs, 200 |
| POST | /api/order-groups | 아래 본문 + Idempotency-Key 헤더 → 묶음 상세, 201 |
| GET | /api/order-groups/:id | 본인이 보낸 묶음 상세, 200 |

숫자 필드는 JSON 정수로 전달합니다. 중복 ID·허용하지 않는 필드·부분 소유권 삭제 요청은 거부합니다.

### 장바구니 항목 예시

```json
{
  "cartItemId": 1, "productId": 76,
  "name": "커피 교환권", "brand": "익산역 카페", "thumbnailUrl": "/images/product_76.png",
  "quantity": 2, "version": 1, "unitPrice": 4500, "subtotal": 9000,
  "productStatus": "active", "canOrder": true, "unavailableReason": null
}
```

### 묶음 주문 요청 예시

헤더 `Idempotency-Key: <crypto.randomUUID() 등 16~64자 영문·숫자·_- 키>`

```json
{
  "items": [
    {"cartItemId":1,"quantity":2,"version":1,"expectedUnitPrice":4500},
    {"cartItemId":2,"quantity":1,"version":1,"expectedUnitPrice":12000}
  ],
  "isSelfGift": false,
  "receiverId": 2,
  "message": "즐거운 하루 보내!"
}
```

- `isSelfGift=true`이면 receiverId를 생략하고 서버가 세션 회원으로 정합니다.
- 메시지는 선택 사항, trim 후 최대 500자입니다. null/빈 문자열은 동일하게 취급합니다.
- expectedUnitPrice는 FE가 확인한 **개당 가격**입니다. totalPrice를 클라이언트에서 받지 않습니다.
- 묶음 상세: orderGroupId, sender/receiver `{userId,nickname}`, isSelfGift, message, totalPrice, totalQuantity, paymentStatus, createdAt, items.
- items는 상품 스냅샷·unitPrice·quantity·subtotal·units `[{orderId,giftId}]`를 담습니다. 수신자 바코드와 내부 요청 키/해시는 노출하지 않습니다.
- 탈퇴 후 userId는 NULL이어도 닉네임 스냅샷은 유지합니다. 다른 회원의 묶음 조회는 존재 여부를 구분하지 않고 404입니다.

### 변경·실패 응답

| 상태 | 코드 | FE 처리 |
| --- | --- | --- |
| 400 | INVALID_CART_BODY / INVALID_ORDER_GROUP_BODY / INVALID_IDEMPOTENCY_KEY | 요청 형식 확인 |
| 400 | ORDER_QUANTITY_EXCEEDED | 50개 이하로 변경 |
| 401 | UNAUTHORIZED | 재로그인; 미확정 주문 키는 같은 계정 범위에서 보존 |
| 404 | CART_ITEM_NOT_FOUND / ORDER_GROUP_NOT_FOUND / RECEIVER_NOT_FOUND | 목록·받는 사람 재확인 |
| 409 | CART_CHANGED / PRODUCT_PRICE_CHANGED / PRODUCT_UNAVAILABLE | 목록 새로고침 후 사용자가 다시 확인 |
| 409 | CART_LIMIT_EXCEEDED / CART_QUANTITY_EXCEEDED | 수량 제한 안내 |
| 409 | IDEMPOTENCY_KEY_REUSED | 같은 키에 다른 본문 금지; 기존 요청 상태 확인 |
| 409 | CART_BUSY | 잠시 후 동일 요청 재시도 |
| 500·통신 단절 | 결과 불명 가능 | 새 키를 만들지 말고 같은 키·본문으로 재시도 |

주문 항목 변경은 `data.items:[{cartItemId,reason}]`에 사유를 제공합니다. 첫 항목의 사유가 최상위 code입니다.

## 3. 중복·동시 요청·기존 주문 호환

- 사용자별 키 UNIQUE + 정규화한 본문 SHA-256. 항목 순서·공백 메시지는 정규화합니다.
- 동일 키·동일 본문은 이미 성공한 결과를 반환합니다. 장바구니가 삭제됐어도 재조회가 가능합니다. 최초/재시도 모두 201입니다.
- 회원 ID 오름차순 잠금 → 같은 키 재조회 → 장바구니 ID 순 잠금 → 상품 ID 순 잠금 → 최신 값 검사 → 발급/삭제/커밋입니다.
- DB가 전체 취소한 deadlock만 최대 3회 시도합니다. 네트워크 오류나 COMMIT 결과 불명은 서버에서 자동 재실행하지 않습니다.
- 단건/묶음은 `orderWriter.js`의 INSERT 함수를 공유합니다. 이 함수는 트랜잭션을 따로 열지 않습니다.
- 바코드는 crypto 기반 12자리 + DB UNIQUE. 해당 바코드 충돌만 최대 5회 시도하며, 모두 실패하면 전체 롤백합니다.
- 기존 단건 API 입력·응답 형태를 유지합니다. 신규 단건에도 상품명·브랜드·이미지 스냅샷을 저장하며, 과거 NULL 스냅샷은 기존 조회 방식으로 표시합니다. 수신자의 선물 목록·상세도 동일한 상품 스냅샷을 사용합니다.

## 4. DB 적용 — 아직 실행 요청 아님

파일: `db/migrate_cart_items.sql`, `db/migrate_order_groups.sql`, `db/migrate_gift_barcode_unique.sql`.

1. Aon에게 API·ERD/DDL 내용 확인, Bio와 실제 운영 적용 일정 조율. main 머지 전에 공유합니다.
2. 기존 리뷰·관리자·알림 마이그레이션의 실제 적용 이력을 확인합니다. 이전 알림 백필을 다시 실행하지 않습니다.
3. 백업 후 쓰기를 중단합니다. 중복 바코드, 기존 테이블·컬럼·제약과 실제 데이터 상태를 확인합니다.
4. 위 세 파일을 순서대로 적용합니다. 중복 바코드가 발견되면 임의로 기존 교환권 번호를 바꾸지 말고 중단합니다.
5. DDL은 자동 커밋이므로 중간 실패 시 전체 재실행하지 않습니다. 생성된 테이블·컬럼·인덱스를 확인하고 남은 단계만 결정합니다.
6. 새 BE 배포 → 기존 단건/묶음/선물 API 검증 → 합의한 FE 배포 → 운영 검증 후 쓰기 재개 순서를 조율합니다.

기존 운영 DB에 schema.sql/seed.sql을 다시 실행하지 않습니다. 신규 묶음 주문 발생 후 테이블을 제거하는 down migration은 하지 않습니다. 장애 시 신규 진입을 중단하고 데이터를 보존한 상태에서 코드 복구 또는 전진 수정을 선택합니다. 구 단건 코드 복구 가능 여부도 별도 확인합니다.

## 5. 로컬 검증

```sh
npm test -- --runInBand
npm run test:cart:db -- <로컬 DB 환경파일 절대경로>
```

통합 스크립트는 loopback MySQL만 허용하고 임시 DB를 생성·삭제합니다. 환경파일의 DB_NAME을 사용하지 않으며 기존 데이터베이스를 변경하지 않습니다.

장바구니 DB 스크립트는 라우터를 불러오기 전에 `scripts/helpers/isolate-product-cache.js`로 Redis를 격리합니다. 실제 캐시 연결·읽기·쓰기를 하지 않으므로 임시 DB 데이터가 공용 캐시에 섞이지 않습니다. 캐시 자체의 통합 검증은 이 테스트 범위가 아닙니다.

- 실제 마이그레이션 3건, 과거 주문 보존, 주문 수량/선물/리뷰 관계
- 같은 키 동시 5회, 다른 키 같은 장바구니, 양방향 선물, 수량 동시 수정
- 가격/상태 변경, 외부 소유 ID, 30종·10개·50개 제한
- 중간 INSERT 실패 전체 롤백, 바코드 충돌 재생성/반복 실패
- 회원 탈퇴 FK·스냅샷 및 완료 요청 재조회

독립 FE 샘플은 별도 `feat/cart-sample` 브랜치의 `/cart-sample`입니다. 기존 상품 상세·주문·선물함 연결 버튼은 변경하지 않았습니다. 정식 FE 통합 전 miku와 작업 범위를 맞춥니다.
