# DB 관계 및 리뷰 스키마

기존 스키마 기준: develop `4c58115`. 리뷰 추가: [설계 이슈 #77](https://github.com/adapterz/wku-iksan-store-BE/issues/77).
전체 생성 SQL은 [schema.sql](schema.sql), 기존 DB 추가 SQL은 [migrate_reviews.sql](migrate_reviews.sql)을 사용합니다.
이 브랜치의 스키마 변경이 운영 DB 적용 완료를 의미하지 않습니다.

## 기존 관계

| 부모 | 자식 | 관계 / 삭제 정책 |
| --- | --- | --- |
| categories | products | 카테고리 1 : 상품 N, 상품 존재 시 카테고리 삭제 제한 |
| users | orders | 주문별 발신자·수신자 각각 0..1명; 탈퇴 시 FK SET NULL |
| products | orders | 상품 1 : 주문 N, 상품 삭제 제한 |
| orders | gifts | 주문 1 : 선물 0..1, gifts.order_id UNIQUE; 선물 존재 시 주문 삭제 제한 |
| users / products | wishlists | 회원·상품별 찜 중복 금지, 삭제 시 해당 찜 CASCADE |

선물의 발신자·수신자는 orders를 경유하며 users에 대한 직접 FK가 없습니다.
주문·선물은 회원 탈퇴 후에도 유지하고 orders의 발신자·수신자 닉네임 스냅샷으로 이력을 표시합니다.

## 선물 도착 알림 상태 (이슈 #101)

기존 관계와 FK는 유지하고 `gifts`에 아래 컬럼만 추가합니다.

| 컬럼 | 자료형 / 기본값 | 의미 |
| --- | --- | --- |
| notified_at | DATETIME NULL / NULL | 도착 안내 확인 시각. NULL이면 아직 안내를 확인하지 않음 |

- `gifts.status`/`used_at`(교환권 사용) 및 개별 선물 열람 여부와는 별개입니다.
- 기존 데이터는 최초 적용 시 `created_at`으로 초기화하여 알림에서 제외합니다. 실제 확인 시각을 의미하지 않습니다.
- 신규 선물 INSERT는 기존처럼 이 컬럼을 생략하며 기본값 NULL로 생성됩니다.
- 알림 대상은 orders 기준 본인 수신·타인에게 받은 선물·결제 완료이며, 발신자 계정 존재 여부는 검사하지 않습니다.
- 마이그레이션: [migrate_gift_notifications.sql](migrate_gift_notifications.sql). 운영 실행은 별도이며 백필은 재실행하지 않습니다.
- API와 검증 방법: [선물 도착 알림](../docs/BE/GIFT_NOTIFICATIONS.md).

## 리뷰 관계

- products 1 : reviews N, gifts 1 : reviews 0..1.
- 리뷰는 회원 0..1명 참조; 계정 삭제 시 user_id NULL, 내용·별점·닉네임은 유지.
- gift_id UNIQUE: 선물 1건당 동시에 리뷰 1건. 사용자 직접 삭제 후 재작성 가능.
- product_id와 user_id는 검증된 선물·세션에서 서버가 결정.
- 상품·선물 삭제는 RESTRICT. 상품 숨김·판매 중지는 관리자 기능에서 별도 설계.
- 공개 목록·통계는 visible만 포함. 숨김 리뷰도 중복 검사와 선물 응답에는 포함.

## 리뷰 테이블

```sql
CREATE TABLE reviews (
    id                          BIGINT AUTO_INCREMENT PRIMARY KEY,
    product_id                  BIGINT NOT NULL,
    gift_id                     BIGINT NOT NULL,
    user_id                     BIGINT,
    reviewer_nickname_snapshot  VARCHAR(50) COLLATE utf8mb4_0900_ai_ci NOT NULL,
    rating                      TINYINT NOT NULL,
    content                     VARCHAR(1000) NOT NULL,
    status                      VARCHAR(20) NOT NULL DEFAULT 'visible',
    created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_reviews_gift UNIQUE (gift_id),
    CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT chk_reviews_status CHECK (status IN ('visible', 'hidden')),
    CONSTRAINT fk_reviews_product
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_gift
        FOREIGN KEY (gift_id) REFERENCES gifts(id) ON DELETE RESTRICT,
    CONSTRAINT fk_reviews_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reviews_product_status_created
    ON reviews (product_id, status, created_at, id);

CREATE INDEX idx_reviews_user_created
    ON reviews (user_id, created_at, id);
```

별점 정렬은 rating 이후 created_at DESC, id DESC로 순서를 고정합니다.
CHECK는 리뷰 테이블에 먼저 도입하며 MySQL 8.0.16 이상에서 동작을 확인합니다.
기존 테이블의 CHECK 전환, 관리자 API·신고·이미지 리뷰는 이번 범위 밖입니다.

## 신고 관계

- reviews 1 : reports N, users(신고자) 1 : reports N.
- 신고 대상은 초기에는 리뷰만 지원(이슈 #90 6절). 사용자·상품 신고는 범위 밖.
- review_id/reporter_id는 SET NULL(CASCADE 아님). 리뷰 작성자가 신고 처리 전에 리뷰를
  삭제하거나 신고자가 탈퇴해도, 신고 시점의 리뷰 내용·별점 스냅샷(review_content_snapshot,
  review_rating_snapshot)이 남아있어 관리자가 계속 조치할 수 있다.
- 동일 사용자의 동일 리뷰 중복 신고는 UNIQUE(review_id, reporter_id)로 금지.
- status는 pending/dismissed/actioned. reviews와 달리 CHECK 제약은 걸지 않고
  애플리케이션 검증으로만 통제(#77 검토 반영 요약 2번 참고).

```sql
CREATE TABLE reports (
    id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
    review_id                BIGINT,
    reporter_id              BIGINT,
    review_content_snapshot  VARCHAR(1000) NOT NULL,
    review_rating_snapshot   TINYINT NOT NULL,
    reason                   VARCHAR(500) NOT NULL,
    status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_reports_review_reporter UNIQUE (review_id, reporter_id),
    CONSTRAINT fk_reports_review
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reports_status_created
    ON reports (status, created_at, id);
```

## 문의하기 관계

- users 1 : inquiries N.
- 문의는 계정 삭제 시 함께 삭제한다(user_id CASCADE). 신고/제재와 달리 계정이
  사라진 뒤에도 남겨서 증거로 삼거나 이력을 보존해야 할 실익이 없는 개인 문의
  기록이기 때문이다(이슈 #90 8절).
- category는 general/sanction_appeal 두 가지. 관리자가 큐에서 빠르게 구분해
  볼 수 있도록 하는 용도이며 별도 테이블로 분리하지 않는다.
- status는 pending/answered. reports·user_sanctions와 마찬가지로 CHECK 제약
  없이 애플리케이션 검증으로만 통제한다.
- sanction_appeal 문의를 승인 처리할 때 `PATCH /api/admin/inquiries/:id` 본문에
  `sanctionId`를 함께 보내면, 문의 답변 저장과 정지 해제(PR #99, 이슈 #90 7-4절)를
  같은 트랜잭션으로 묶어 처리한다. 처리 당시 지정된 sanctionId는 `resolved_sanction_id`에
  기록한다(FK 아님, sanctionId 없이 처리한 답변은 NULL) — 답변 문구만으로 "같은
  요청의 재시도"를 판단하면, 문구가 우연히 같고 sanctionId만 다른 요청까지 재시도로
  오인해 엉뚱한 정지가 추가로 해제될 수 있어(PR #100 리뷰 코멘트), 재시도 판정에는
  답변 문구와 이 값을 함께 비교한다.

```sql
CREATE TABLE inquiries (
    id                    BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id               BIGINT NOT NULL,
    category              VARCHAR(20) NOT NULL DEFAULT 'general',
    content               VARCHAR(1000) NOT NULL,
    admin_reply           VARCHAR(1000),
    resolved_sanction_id  BIGINT,
    status                VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_inquiries_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_inquiries_status_created
    ON inquiries (status, created_at, id);

CREATE INDEX idx_inquiries_user_created
    ON inquiries (user_id, created_at, id);
```

## 회원 제재 관계

- users(제재 대상) 1 : user_sanctions N, users(관리자) 1 : user_sanctions N(issued_by).
- type은 warning/suspension. warning은 ends_at NULL, suspension은 ends_at 필수(이슈 #90 7절).
- 경고가 이미 1건 이상 있는 유저에게 또 경고를 주려는 요청은 애플리케이션 레벨에서 거부한다
  (자동 격상 없음, 관리자가 명시적으로 suspension을 다시 요청해야 함).
- status는 active/lifted. 정지의 자연 만료는 상태를 바꾸지 않고 조회 시점에 ends_at으로 판단.
- user_id는 CASCADE(유저가 사라지면 그 유저에 대한 제재 기록도 의미가 없음), issued_by는
  SET NULL(제재를 내린 관리자가 나중에 탈퇴해도 제재 기록 자체는 유지). CHECK 제약은
  reviews에만 우선 적용하기로 했으므로 여기서도 걸지 않는다.

```sql
CREATE TABLE user_sanctions (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    type            VARCHAR(20) NOT NULL,
    reason          VARCHAR(500) NOT NULL,
    issued_by       BIGINT,
    ends_at         DATETIME,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sanctions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sanctions_admin
        FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sanctions_user_created
    ON user_sanctions (user_id, created_at, id);
```

리뷰 작성 제한 훅(`POST /api/reviews`)과 계정 삭제 시 활성 정지 확인(`DELETE /api/users/me`)은
이 마이그레이션 범위 밖이며 후속 작업입니다(이슈 #90 7-3, 7-5절).

## 검증·배포

재현 방법과 응답 규칙: [리뷰 API 구현·검증 안내](../docs/BE/REVIEWS.md).
운영은 #87 완료 확인 → DB 버전 확인·백업 → migrate_reviews.sql → 코드 배포 → 검증 순서입니다.
리뷰 JOIN이 기존 선물 조회에도 추가되므로 마이그레이션 없이 코드만 배포하면 안 됩니다.
