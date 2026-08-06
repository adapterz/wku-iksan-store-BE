-- [목적] M3(카테고리) 기능을 위해 categories 테이블을 신규 생성하고,
-- 기존 products 18개 데이터에 category_id를 매핑한다.
--
-- [배경] 위키 "ERD 설계" 3번(categories 테이블), 4번(products 테이블),
-- 8번(마이그레이션 순서) 섹션 기준. products.category_id는 categories(id)를
-- 참조하며 최종적으로 NOT NULL + FK(ON DELETE RESTRICT)로 확정되지만,
-- 매핑 작업 중에는 NULL을 허용한 상태를 거친다.
--
-- [카테고리 목록/매핑 기준] 기존 18개 상품의 카테고리 매핑 기준이 팀 논의로
-- 확정되지 않아, 상품명 기준으로 아래 6개 카테고리를 임시 제안하여 매핑했다.
-- 팀 검토 후 카테고리명/구성이 바뀌면 이 파일의 ②, ④ 블록만 수정하면 된다.
--   음료: 아메리카노 교환권, 카페 음료 교환권, 커피 원두 세트
--   베이커리·간식: 베이커리 세트, 수제 한과 세트, 서동마을 떡 세트
--   축산·농산물: 한우 불고기 세트, 농산물 꾸러미, 쌀 10kg, 딸기 세트
--   외식·상품권: 황등 비빔밥 이용권, 전통시장 상품권
--   체험·관광이용권: 미륵산 체험권, 보석박물관 입장권, 문화 체험 패키지, 함라 한옥마을 체험권
--   지역특산 선물세트: 지역 특산품 선물세트, 로컬 와인 선물세트
--
-- [사전 점검] 이 스크립트 실행 전, 로컬 DB(iksanshop)에 products가 정확히
-- 18건이고 이름이 seed.sql과 동일한지 확인한다 (④ 매핑은 name으로 매칭한다).
--   SELECT COUNT(*) FROM products;
-- 이미 category_id 컬럼이 존재하면 ③에서 오류가 나므로 아래로 먼저 확인한다.
--   SHOW COLUMNS FROM products LIKE 'category_id';
--
-- [실행 방법] MySQL 콘솔에서 SOURCE 명령으로 실행한다 (인코딩 유실 방지, docs/DB/DEVLOG.md 참고).
--   mysql> SOURCE db/migrate_categories.sql;
--
-- [진행 순서 안내] 이 파일은 마이그레이션 8단계 중 ①~⑤만 수행한다.
-- 마지막에 실행되는 ⑤ 검증 쿼리 2개의 결과가 모두 0건/빈 결과인 것을 확인한 뒤에만
-- db/migrate_categories_finalize.sql(⑥ NOT NULL 전환 + FK 적용)을 이어서 실행한다.
-- 검증 결과에 문제가 있으면 finalize 스크립트를 실행하지 말고 매핑을 먼저 바로잡는다.
--
-- [운영 반영 주의] 운영 DB에 반영하기 전 반드시 DB 백업을 먼저 수행할 것.
-- 이 스크립트 자체는 운영 DB에 대해 실행하지 않았으며, 운영 반영은 팀 검증 후
-- Bio(Cloud 담당)에게 요청해 별도로 진행한다.

-- ① categories 테이블 생성
CREATE TABLE categories (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(50) NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_categories_name UNIQUE (name)
);

-- ② 카테고리 데이터 등록 (표시 순서는 id 오름차순 고정, ORDER BY id ASC)
INSERT INTO categories (name) VALUES
('음료'),
('베이커리·간식'),
('축산·농산물'),
('외식·상품권'),
('체험·관광이용권'),
('지역특산 선물세트');

-- ③ products.category_id 컬럼을 NULL 허용으로 추가 (매핑 완료 전까지 임시)
ALTER TABLE products
    ADD COLUMN category_id BIGINT NULL AFTER usage_info;

-- ④ 기존 18개 상품 category_id 매핑 (상품명 기준, seed.sql과 동일한 이름 전제)
UPDATE products SET category_id = (SELECT id FROM categories WHERE name = '음료')
    WHERE name IN ('익산역 아메리카노 교환권', '익산 카페 음료 교환권', '익산 커피 원두 세트');

UPDATE products SET category_id = (SELECT id FROM categories WHERE name = '베이커리·간식')
    WHERE name IN ('익산 로컬 베이커리 세트', '익산 수제 한과 세트', '익산 서동마을 떡 세트');

UPDATE products SET category_id = (SELECT id FROM categories WHERE name = '축산·농산물')
    WHERE name IN ('익산 한우 불고기 세트', '익산 농산물 꾸러미', '익산 쌀 10kg', '익산 딸기 세트');

UPDATE products SET category_id = (SELECT id FROM categories WHERE name = '외식·상품권')
    WHERE name IN ('익산 황등 비빔밥 이용권', '익산 전통시장 상품권');

UPDATE products SET category_id = (SELECT id FROM categories WHERE name = '체험·관광이용권')
    WHERE name IN ('익산 미륵산 체험권', '익산 보석박물관 입장권', '익산 문화 체험 패키지', '익산 함라 한옥마을 체험권');

UPDATE products SET category_id = (SELECT id FROM categories WHERE name = '지역특산 선물세트')
    WHERE name IN ('익산 지역 특산품 선물세트', '익산 로컬 와인 선물세트');

-- ⑤ 매핑 누락 확인 (아래 두 쿼리 모두 결과가 비어 있어야 finalize 스크립트로 진행 가능)
-- category_id가 NULL인 상품이 있는지 확인
SELECT COUNT(*) AS unmapped_count FROM products WHERE category_id IS NULL;

-- 존재하지 않는 카테고리를 참조하는 상품이 있는지 확인
SELECT p.id, p.name, p.category_id
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.category_id IS NULL OR c.id IS NULL;
