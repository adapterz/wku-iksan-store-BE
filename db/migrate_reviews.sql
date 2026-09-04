-- 리뷰 테이블 추가 (#77). 기존 데이터 삭제/수정 없음.
-- 운영 적용: #87의 기존 DB 마이그레이션·배포·검증 완료 확인 후 별도 적용.
-- 사전 확인: SELECT VERSION(); SHOW TABLES LIKE 'reviews';
-- MySQL 8.0.16 이상(CHECK 강제 지원) 필요. 실행 전에 백업한다.
-- users/products/orders/gifts 및 주문 닉네임 스냅샷·SET NULL 마이그레이션이 선행되어야 한다.
-- 최초 생성 DB는 schema.sql을 사용한다. 같은 DB에 schema.sql과 이 파일을 모두 실행하지 않는다.
-- 실행: MySQL 콘솔에서 SOURCE db/migrate_reviews.sql;
-- 이미 테이블이 있으면 재실행하지 말고 SHOW CREATE TABLE로 구조를 비교한다.
-- 새 코드는 선물 조회에서도 reviews를 참조하므로 반드시 이 SQL을 코드보다 먼저 적용한다.

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

-- 적용 후 확인 (기존 코드로 복귀할 때도 리뷰 데이터는 유지한다):
-- SHOW CREATE TABLE reviews;
-- SHOW INDEX FROM reviews;
-- 개발용 DB에서 UNIQUE/FK/CHECK·회원 삭제 시 리뷰 보존을 검증한다.
