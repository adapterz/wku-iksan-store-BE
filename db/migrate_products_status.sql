-- [목적] 이슈 #90(관리자 페이지)에 따라 상품을 물리 삭제하지 않고 숨김/단종 처리할 수
-- 있도록 상태 컬럼을 추가한다. orders/reviews의 product_id FK가 이미 상품 삭제를
-- 막고 있어 물리 삭제는 애초에 불가능하므로, 숨김 처리가 유일한 실질적 선택지다.
--
-- [설계 기준]
-- - 상태는 'active' / 'hidden' / 'discontinued' 세 가지이며 관리자가 수동으로 전환한다.
-- - 재고 기반 자동 단종 처리는 이번 범위에서 제외한다(후속 이슈로 분리).
-- - 이 프로젝트는 CHECK 제약을 reviews 테이블에만 우선 적용하기로 했으므로(#77 리뷰 참고),
--   여기서는 CHECK를 걸지 않고 애플리케이션 검증으로만 값을 통제한다.
-- - 고객 대상 조회(목록/랭킹/상세/브랜드/검색)는 status = 'active'만 노출해야 한다.
--   단, 위시리스트는 사용자가 이미 찜한 상품이 조용히 사라지면 혼란스러우므로
--   숨김/단종 상품도 그대로 노출하되 status 값을 함께 내려준다.
--
-- [선행 조건]
-- - products 테이블이 존재해야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 신규 컬럼이 없는지 확인한다.
--   SHOW COLUMNS FROM products LIKE 'status';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_products_status.sql;

ALTER TABLE products
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active' AFTER category_id;

-- [적용 후 확인]
SHOW CREATE TABLE products;
SELECT id, name, status FROM products LIMIT 5;
