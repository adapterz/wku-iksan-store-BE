# DB 연동 전환 기록과 남은 개선 사항

초기 Mock 데이터에서 DB 연동으로 전환할 때 작성한 목록입니다. **2026-11-09 코드 대조 기준**으로 완료 항목과 남은 개선 사항을 구분했습니다. 과거 단계명은 당시 기록입니다.

## 파일/모듈 교체 목록

- [x] `db/models/userModel.js`
  - [x] `mockUsers` 배열 제거
  - [x] `getUserByEmail`: 실제 DB 조회 쿼리(`SELECT * FROM users WHERE email = ?`)로 교체
  - [x] `getUserByNickname`: 실제 DB 조회 쿼리(`SELECT * FROM users WHERE nickname = ?`)로 교체
  - [x] `getUserById`: 세션 인증용으로 실제 DB 조회 쿼리 추가
  - [x] `createUser`: 실제 DB 데이터 삽입(`INSERT INTO users ...`)으로 교체
  - [x] 회원가입 시 비밀번호 `bcrypt` 단방향 해시 암호화 로직 추가

- [x] `db/models/productModel.js`
  - [x] `mockProducts` 배열 대신 실제 DB 사용
  - [x] `getProductById`: 상품·브랜드·카테고리를 조인하는 실제 DB 조회로 구현

## 라우터 보완 목록

- [x] `routes/auth.js` (`POST /api/auth/login`)
  - [x] 단순 문자열(`user.password !== password`) 비교 로직을 `bcrypt.compare()` 함수를 활용한 검증 로직으로 변경
  - [x] 로그인 성공 시 `express-session`에 회원 ID·인증 버전을 저장하는 방식으로 구현(JWT 방식 아님)

- [x] M2 2단계 인증/인가·세션 보완
  - [x] `POST /api/auth/logout` 엔드포인트 구현
  - [x] `GET /api/me` 엔드포인트 구현 (현재 `/api/auth/me` 로 구현됨)
  - [x] `requireLogin` 미들웨어 구현 및 필요한 라우터(`orders`, `gifts` 등)에 적용

## 남은 개선 사항 — 후속 검토

- [ ] **세션 스토어 교체 검토**: 현재 `app.js`는 메모리 기반 세션 스토어를 사용합니다. 서버 재시작 시 세션이 초기화되고 다중 서버에서 공유되지 않습니다. 로그인 유지·다중 서버 지원이 필요하면 Redis 등 외부 스토어와 만료 정책을 함께 설계합니다. Redis를 다른 용도로 사용 중이라는 사실만으로 세션도 Redis에 저장되는 것은 아닙니다. 이번 문서 정리는 구현 착수나 일정 확정을 뜻하지 않습니다.

## 후속으로 구현된 계층

- `db/models/orderModel.js`, `db/models/giftModel.js`, `db/models/orderGroupModel.js`에 주문·선물·주문 그룹 DB 처리가 구현되어 있습니다.
- 세부 동작은 [장바구니·주문 그룹](../docs/BE/CART_ORDER_GROUPS.md), [교환권 취소](../docs/BE/GIFT_CANCELLATION.md)를 참고합니다.
