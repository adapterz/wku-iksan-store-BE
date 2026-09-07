-- [목적] 이슈 #68 논의에 따라 상품 상세의 "상세정보"를 유효기간/사용방법/교환처/
-- 주의사항 4개 항목으로 구조화한다. FE가 각 항목을 라벨+값으로 별도 줄에
-- 표시할 수 있도록, 기존 usage_info 단일 컬럼을 4개 컬럼으로 분리한다.
--
-- [설계 기준]
-- - "상품 설명"(description)은 마케팅성 자유 서술 문구로 그대로 유지한다.
-- - "상세정보"만 valid_period/usage_method/exchange_location/caution
--   4개 컬럼으로 분리한다 (각 VARCHAR(300), NULL 허용).
-- - 실제 항목별 콘텐츠 작성은 FE/배포 담당자가 진행하므로, 이 마이그레이션은
--   기존 usage_info 값을 의미가 가장 가까운 usage_method로 그대로 옮기고
--   나머지 3개 컬럼은 비워둔다 (db/seed.sql 상단 주석 참고).
--
-- [선행 조건]
-- - products 테이블이 존재해야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 신규 컬럼이 없는지 확인한다.
--   SHOW COLUMNS FROM products LIKE 'usage_method';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_product_detail_fields.sql;

ALTER TABLE products
    ADD COLUMN valid_period      VARCHAR(300) AFTER description,
    ADD COLUMN usage_method      VARCHAR(300) AFTER valid_period,
    ADD COLUMN exchange_location VARCHAR(300) AFTER usage_method,
    ADD COLUMN caution           VARCHAR(300) AFTER exchange_location;

UPDATE products SET usage_method = usage_info;

ALTER TABLE products DROP COLUMN usage_info;

-- [적용 후 확인]
-- 아래 명령으로 컬럼 구성과 이관된 값을 확인한다.
SHOW CREATE TABLE products;
SELECT id, name, usage_method FROM products LIMIT 5;
