-- [목적] db/migrate_categories.sql(①~⑤)로 매핑을 마친 뒤, products.category_id를
-- NOT NULL로 전환하고 categories(id) FK 제약(ON DELETE RESTRICT)을 적용한다.
--
-- [배경] 위키 "ERD 설계" 8번(마이그레이션 순서) 6단계. ON DELETE RESTRICT는
-- 연결된 상품이 있는 카테고리의 삭제를 막아, 카테고리 없는 상품이 생기는 것을
-- 방지한다. 현재 M3 범위에는 카테고리 삭제 API가 없어 이 제약은 우선 DB 레벨
-- 보호 장치이며, 위반 시 500이 아닌 409 CATEGORY_IN_USE로 변환하는 코드는
-- 향후 카테고리 삭제 API 추가 시점에 연결한다.
--
-- [사전 점검] 반드시 db/migrate_categories.sql 마지막 ⑤ 검증 쿼리 2개를 먼저
-- 실행해 두 결과 모두 비어 있음(매핑 누락 0건)을 확인한 뒤에만 이 스크립트를
-- 실행한다. 누락이 있는 상태로 NOT NULL 전환을 시도하면 ALTER TABLE이 실패한다.
--
-- [실행 방법] MySQL 콘솔에서 SOURCE 명령으로 실행한다 (인코딩 유실 방지, docs/DB/DEVLOG.md 참고).
--   mysql> SOURCE db/migrate_categories_finalize.sql;
--
-- [영향 범위] products.category_id가 NOT NULL로 바뀌고 fk_products_category FK가
-- 추가된다. 이후 카테고리 없는 상품 등록/카테고리 삭제가 DB 레벨에서 차단된다.
--
-- [운영 반영 주의] 운영 DB에 반영하기 전 반드시 DB 백업을 먼저 수행할 것.
-- 이 스크립트 자체는 운영 DB에 대해 실행하지 않았으며, 운영 반영은 팀 검증 후
-- Bio(Cloud 담당)에게 요청해 별도로 진행한다.

-- ⑥ NOT NULL 전환 + FK(ON DELETE RESTRICT) 적용
ALTER TABLE products
    MODIFY COLUMN category_id BIGINT NOT NULL,
    ADD CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT;
