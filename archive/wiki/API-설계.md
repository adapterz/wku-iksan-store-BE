## 1. 인증

### 1-1. 회원가입

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | `email: String, password: String, nickname: String` | 필수: email, password, nickname |

| Response status | data |
| --- | --- |
| 201 | `{ "status":201, "code":"SIGNUP_SUCCESS", "message":null, "data":{ "userId":1, "email":"test@test.kr", "nickname":"테스트777", "createdAt":"2026-07-03T09:59:50.000Z" } }` |
| 400 | `{ "status":400, "code":"REQUIRED_EMAIL", "message":null, "data":null }` |
| 400 | `{ "status":400, "code":"REQUIRED_PASSWORD", "message":null, "data":null }` |
| 400 | `{ "status":400, "code":"REQUIRED_NICKNAME", "message":null, "data":null }` |
| 409 | `{ "status":409, "code":"EMAIL_ALREADY_EXISTS", "message":null, "data":null }` |
| 409 | `{ "status":409, "code":"NICKNAME_ALREADY_EXISTS", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

### 1-2. 로그인

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | `email: String, password: String` | 필수: email, password |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"LOGIN_SUCCESS", "message":null, "data":{ "userId":1, "email":"test@test.kr", "nickname":"테스트777" } }` |
| 400 | `{ "status":400, "code":"REQUIRED_EMAIL", "message":null, "data":null }` |
| 400 | `{ "status":400, "code":"REQUIRED_PASSWORD", "message":null, "data":null }` |
| 401 | `{ "status":401, "code":"INVALID_EMAIL_OR_PASSWORD", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

### 1-3. 로그아웃

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| POST | `/api/auth/logout` | - | 세션 종료, 인증 필요 |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"LOGOUT_SUCCESS", "message":null, "data":null }` |
| 401 | `{ "status":401, "code":"UNAUTHORIZED", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

### 1-4. 로그인 상태 확인

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| GET | `/api/auth/me` | - | 세션 유효성 확인 |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"SESSION_VALID", "message":null, "data":{ "userId":1, "email":"test@test.kr", "nickname":"테스트777" } }` |
| 401 | `{ "status":401, "code":"UNAUTHORIZED", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

---

## 2. 유저

### 2-1. 유저 검색

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| GET | `/api/users/search?nickname={nickname}` | - | 인증 필요, 받는 사람 검색 |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"USER_SEARCH_SUCCESS", "message":null, "data":{ "userId":2, "nickname":"친구닉네임" } }` |
| 404 | `{ "status":404, "code":"USER_NOT_FOUND", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

---

## 3. 상품

### 3-1. 상품 목록 조회

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| GET | `/api/products` | - | 인증 불필요 |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"PRODUCT_LIST_SUCCESS", "message":null, "data":[ { "id":1, "name":"익산역 아메리카노 교환권", "brand":"익산역점", "price":4500, "thumbnailUrl":"https://.../p1.jpg" } ] }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

### 3-2. 상품 상세 조회

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| GET | `/api/products/:id` | - | params: productId |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"PRODUCT_DETAIL_SUCCESS", "message":null, "data":{ "id":1, "name":"익산역 아메리카노 교환권", "brand":"익산역점", "price":4500, "thumbnailUrl":"https://.../p1.jpg", "description":"...", "usageInfo":"발급일로부터 30일 이내 사용 가능" } }` |
| 404 | `{ "status":404, "code":"PRODUCT_NOT_FOUND", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

---

## 4. 주문

### 4-1. 주문 생성

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| POST | `/api/orders` | `productId: Number, message: String, isSelfGift: Boolean, receiverId: Number` | 인증 필요, 필수: productId, isSelfGift / isSelfGift가 false일 경우 receiverId 필수 (receiverId는 GET /api/users/search로 사전 조회) |

- `isSelfGift: true` → 주문자(로그인 유저) 본인이 선물함 소유자가 됨. `receiverId` 무시.
- `isSelfGift: false` → `receiverId`로 지정된 유저가 선물함 소유자가 됨.

| Response status | data |
| --- | --- |
| 201 | `{ "status":201, "code":"ORDER_CREATE_SUCCESS", "message":null, "data":{ "orderId":101, "giftId":55 } }` |
| 400 | `{ "status":400, "code":"REQUIRED_PRODUCT_ID", "message":null, "data":null }` |
| 400 | `{ "status":400, "code":"REQUIRED_IS_SELF_GIFT", "message":null, "data":null }` |
| 400 | `{ "status":400, "code":"REQUIRED_RECEIVER_ID", "message":null, "data":null }` (isSelfGift가 false인데 receiverId 누락 시) |
| 401 | `{ "status":401, "code":"UNAUTHORIZED", "message":null, "data":null }` |
| 404 | `{ "status":404, "code":"PRODUCT_NOT_FOUND", "message":null, "data":null }` |
| 404 | `{ "status":404, "code":"RECEIVER_NOT_FOUND", "message":null, "data":null }` (receiverId에 해당하는 유저가 없을 시) |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

### 4-2. 주문 상세 조회

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| GET | `/api/orders/:id` | - | 인증 필요, params: orderId, 주문자 본인만 조회 가능 |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"ORDER_DETAIL_SUCCESS", "message":null, "data":{ "orderId":101, "product":{ "id":1, "name":"익산역 아메리카노 교환권", "brand":"익산역점", "thumbnailUrl":"https://.../p1.jpg" }, "totalPrice":4500, "message":"나는 내가 챙긴다! 소중한 나에게 주는 선물", "isSelfGift":false, "receiver":{ "userId":2, "nickname":"친구닉네임" }, "paymentStatus":"paid", "giftId":55, "createdAt":"2026-07-03T10:00:00Z" } }` |
| 401 | `{ "status":401, "code":"UNAUTHORIZED", "message":null, "data":null }` |
| 403 | `{ "status":403, "code":"FORBIDDEN_NOT_OWNER", "message":null, "data":null }` |
| 404 | `{ "status":404, "code":"ORDER_NOT_FOUND", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

> `isSelfGift`가 true인 경우에도 `receiver`에는 항상 본인 정보(userId, nickname)가 채워져서 반환됩니다. (null 반환 없음)
> `paymentStatus`는 항상 `paid`로 반환됩니다.

---

## 5. 선물함 / 바코드

### 5-1. 받은 선물 조회

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| GET | `/api/gifts?status=unused\|used` | - | 인증 필요, query: status, **receiverId 기준**으로 조회 (본인이 받은 선물만), status는 선택 사항이며, 값이 없으면 받은 선물 전체를 반환 |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"GIFT_LIST_SUCCESS", "message":null, "data":[ { "giftId":55, "productName":"익산역 아메리카노 교환권", "thumbnailUrl":"https://.../p1.jpg", "status":"unused", "senderNickname":"보낸사람닉네임", "isSelfGift":false, "createdAt":"2026-07-03T10:00:00Z" } ] }` |
| 401 | `{ "status":401, "code":"UNAUTHORIZED", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

### 5-2. 선물 바코드 상세 조회

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| GET | `/api/gifts/:id` | - | 인증 필요, params: giftId, **소유자(receiverId)만** 조회 가능 |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"GIFT_DETAIL_SUCCESS", "message":null, "data":{ "giftId":55, "productName":"익산역 아메리카노 교환권", "thumbnailUrl":"https://.../p1.jpg", "barcode":"880123456789", "status":"unused", "usedAt":null, "sender":{ "userId":1, "nickname":"보낸사람닉네임" }, "message":"소중한 나에게 주는 선물입니다" } }` |
| 401 | `{ "status":401, "code":"UNAUTHORIZED", "message":null, "data":null }` |
| 403 | `{ "status":403, "code":"FORBIDDEN_NOT_OWNER", "message":null, "data":null }` |
| 404 | `{ "status":404, "code":"GIFT_NOT_FOUND", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |

> 바코드는 `barcode` 문자열 하나만 응답에 포함되며, 프론트엔드에서 JsBarcode 등의 라이브러리로 이 값을 렌더링합니다. (`barcodeImageUrl` 없음)

### 5-3. 바코드 사용

| Request method | url | body | 설명 |
| --- | --- | --- | --- |
| PATCH | `/api/gifts/:id/use` | - | 인증 필요, params: giftId, unused → used |

| Response status | data |
| --- | --- |
| 200 | `{ "status":200, "code":"GIFT_USE_SUCCESS", "message":null, "data":{ "giftId":55, "status":"used", "usedAt":"2026-07-03T11:00:00Z" } }` |
| 401 | `{ "status":401, "code":"UNAUTHORIZED", "message":null, "data":null }` |
| 403 | `{ "status":403, "code":"FORBIDDEN_NOT_OWNER", "message":null, "data":null }` |
| 404 | `{ "status":404, "code":"GIFT_NOT_FOUND", "message":null, "data":null }` |
| 409 | `{ "status":409, "code":"GIFT_ALREADY_USED", "message":null, "data":null }` |
| 500 | `{ "status":500, "code":"INTERNAL_SERVER_ERROR", "message":null, "data":null }` |