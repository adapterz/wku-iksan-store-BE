# ERD 설계 (SQL 스크립트)

## 1. 전체 구조 개요

| 테이블 | 설명 | 관계 |
| --- | --- | --- |
| users | 회원 정보 | orders(1:N), gifts(1:N, receiver/sender) |
| products | 상품 정보 | orders(1:N) |
| orders | 주문 정보 | users(N:1), products(N:1), gifts(1:1) |
| gifts | 선물함/바코드 정보 | orders(1:1), users(N:1, receiver/sender) |

---

## 2. users 테이블

API 명세: 1-1(회원가입), 1-2(로그인), 2-1(유저 검색) 반영

```sql
CREATE TABLE users (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    password        VARCHAR(255) NOT NULL,
    nickname        VARCHAR(50) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT uq_users_nickname UNIQUE (nickname)
);
```

- `email`, `nickname` : UNIQUE 적용 → 409 EMAIL_ALREADY_EXISTS, 409 NICKNAME_ALREADY_EXISTS 응답 근거

---

## 3. products 테이블

API 명세: 3-1(상품 목록 조회), 3-2(상품 상세 조회) 반영

```sql
CREATE TABLE products (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    brand           VARCHAR(255) NOT NULL,
    price           INT NOT NULL,
    thumbnail_url   VARCHAR(500),
    description     TEXT,
    usage_info      VARCHAR(500)
);
```

- `usage_info` : 유효기간 등 이용 안내 문구를 텍스트로만 저장 (예: "발급일로부터 30일 이내 사용 가능")
- 별도 유효기간 필드/자동 만료 기능 없음

---

## 4. orders 테이블

API 명세: 4-1(주문 생성), 4-2(주문 상세 조회) 반영

```sql
CREATE TABLE orders (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    receiver_id     BIGINT NOT NULL,
    total_price     INT NOT NULL,
    message         VARCHAR(500),
    is_self_gift    BOOLEAN NOT NULL,
    payment_status  VARCHAR(20) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_orders_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_orders_receiver FOREIGN KEY (receiver_id) REFERENCES users(id)
);
```

- `user_id` : 주문자(로그인 유저)
- `receiver_id` : 선물함 소유자. `is_self_gift = true`인 경우에도 주문자 본인의 `id`를 그대로 저장 (null 없음)
- `payment_status` : ENUM/CHECK 미사용, 일반 문자열 컬럼. 저장값은 `paid`로 소문자 통일
- `status`, `used_at` 관련 컬럼은 **orders에 두지 않음** (gifts에서만 관리)

---

## 5. gifts 테이블

API 명세: 5-1(받은 선물 조회), 5-2(바코드 상세 조회), 5-3(바코드 사용) 반영

```sql
CREATE TABLE gifts (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id        BIGINT NOT NULL,
    barcode         VARCHAR(50) NOT NULL,
    status          VARCHAR(20) NOT NULL,
    used_at         DATETIME,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_gifts_order_id UNIQUE (order_id),
    CONSTRAINT fk_gifts_order FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

- `order_id` : UNIQUE 적용 → orders와 1대1 관계 보장
- `barcode` : 바코드 문자열 하나만 저장 (이미지 URL 컬럼 없음)
- `status` : ENUM/CHECK 미사용, 일반 문자열 컬럼. 저장값은 `unused`, `used`로 소문자 통일
- `used_at` : 선물 사용 시각. 선물 사용 여부 관련 정보는 gifts 테이블에서만 관리

---

## 6. 관계 요약 (ERD 텍스트 표현)

```
users (1) ──< (N) orders
users (1) ──< (N) gifts        (receiver 조회는 orders.receiver_id를 경유)
products (1) ──< (N) orders
orders (1) ── (1) gifts        [gifts.order_id UNIQUE]
```

- `users.id` → `orders.user_id` (주문자)
- `users.id` → `orders.receiver_id` (받는 사람)
- `products.id` → `orders.product_id`
- `orders.id` → `gifts.order_id` (1:1, UNIQUE)

---