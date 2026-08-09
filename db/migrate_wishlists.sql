-- [목적] M3 찜 기능에서 사용할 wishlists 테이블을 기존 DB에 추가한다.
--
-- [설계 기준]
-- - 한 회원이 같은 상품을 중복으로 찜하지 못하도록 user_id와 product_id에
--   복합 UNIQUE 제약을 적용한다.
-- - 회원이나 상품이 삭제되면 의미가 없어진 찜 관계도 함께 정리되도록
--   두 외래 키에 ON DELETE CASCADE를 적용한다.
--
-- [선행 조건]
-- - users와 products 테이블이 존재해야 한다.
-- - 찜 목록 API가 상품의 카테고리 정보를 함께 조회하므로 카테고리
--   마이그레이션을 먼저 완료한 뒤 이 파일을 실행한다.
-- - 실행 전 운영 DB를 백업하고 wishlists 테이블이 없는지 확인한다.
--   SHOW TABLES LIKE 'wishlists';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_wishlists.sql;

CREATE TABLE wishlists (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    product_id      BIGINT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_wishlists_user_product UNIQUE (user_id, product_id),
    CONSTRAINT fk_wishlists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlists_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- [적용 후 확인]
-- 아래 명령으로 컬럼과 UNIQUE/FK/CASCADE 설정을 확인한다.
SHOW CREATE TABLE wishlists;
