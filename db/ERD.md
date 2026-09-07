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

## 검증·배포

재현 방법과 응답 규칙: [리뷰 API 구현·검증 안내](../docs/BE/REVIEWS.md).
운영은 #87 완료 확인 → DB 버전 확인·백업 → migrate_reviews.sql → 코드 배포 → 검증 순서입니다.
리뷰 JOIN이 기존 선물 조회에도 추가되므로 마이그레이션 없이 코드만 배포하면 안 됩니다.
