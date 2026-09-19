-- [목적] 성능 점검(이슈 없음, 예방적 조치)에서 확인된 미인덱스 컬럼 3개에 인덱스를
-- 추가한다. 셋 다 PK도 FK도 아니라서 InnoDB 자동 인덱스 대상이 아니며, EXPLAIN으로
-- 풀 테이블 스캔이 되는 것을 실측으로 확인했다.
--
-- - products.status: 고객용 상품 목록/상세/브랜드 목록/관리자 대시보드가 전부
--   status='active' 조건으로 조회한다(예: db/models/productModel.js
--   ACTIVE_STATUS_CONDITION). 지금은 상품 수가 적어 체감 지연이 없지만, 상품이
--   많아지면 조회할 때마다 전체 테이블을 훑게 된다.
-- - products.brand: 브랜드 목록(db/models/brandModel.js)이 브랜드별 그룹핑·필터링에
--   사용한다.
-- - user_sanctions(type, status): 관리자 대시보드의 활성 정지자 수 집계
--   (db/models/dashboardModel.js countActiveSuspensions)가 user_id 없이 이 두
--   컬럼만으로 필터링해 기존 idx_sanctions_user_created(user_id, ...)를 타지 못한다.
--
-- 셋 다 조회 조건만 빨라지는 인덱스 추가라 기존 쿼리 결과나 애플리케이션 동작에는
-- 영향이 없다.
--
-- [선행 조건] products, user_sanctions 테이블이 존재해야 한다.
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_perf_indexes.sql;

CREATE INDEX idx_products_status ON products (status);
CREATE INDEX idx_products_brand ON products (brand);
CREATE INDEX idx_sanctions_type_status ON user_sanctions (type, status);

-- [적용 후 확인]
SHOW INDEX FROM products;
SHOW INDEX FROM user_sanctions;
