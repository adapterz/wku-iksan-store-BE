-- [목적] 이슈 #56 요청에 따라 상품설명(description) 영역에 이미지를 함께
-- 노출할 수 있도록 products 테이블에 이미지 URL 컬럼을 추가한다.
--
-- [설계 기준]
-- - 상품설명 텍스트(description)는 그대로 두고, 이미지 1장의 URL만 별도
--   컬럼으로 관리한다 (thumbnail_url과 동일하게 URL 문자열만 저장, 업로드는
--   BE 범위 밖).
-- - 기존 상품에는 값이 없으므로 NULL 허용.
--
-- [선행 조건]
-- - products 테이블이 존재해야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 신규 컬럼이 없는지 확인한다.
--   SHOW COLUMNS FROM products LIKE 'description_image_url';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_product_description_image.sql;

ALTER TABLE products
    ADD COLUMN description_image_url VARCHAR(500) AFTER description;

-- [적용 후 확인]
SHOW CREATE TABLE products;
