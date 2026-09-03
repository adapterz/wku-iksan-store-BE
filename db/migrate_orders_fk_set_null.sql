-- [목적] 이슈 #72 논의의 마지막 단계. 계정 하드 삭제를 지원하기 위해 orders의
-- user_id/receiver_id FK를 nullable로 바꾸고 ON DELETE SET NULL을 적용한다.
-- 이전에는 기본값(RESTRICT)이라 주문 이력이 있는 유저는 DB 단에서 삭제 자체가
-- 거부됐다. 이 마이그레이션 이후에는 유저가 삭제되면 관련 주문의 user_id/
-- receiver_id만 NULL로 바뀌고, 발신자/수신자 닉네임은
-- sender_nickname_snapshot/receiver_nickname_snapshot에 그대로 남는다.
--
-- [선행 조건]
-- - db/migrate_order_nickname_snapshot.sql이 먼저 적용되어 있어야 한다
--   (스냅샷 컬럼과 기존 데이터 백필이 없으면, 탈퇴 발생 시 해당 주문의 발신자/
--   수신자 정보를 복구할 방법이 없어진다).
-- - orderModel.js의 신규 주문 저장 로직과 giftModel.js의 조회 로직이 스냅샷
--   기준으로 동작하도록 먼저 배포되어 있어야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 기존 제약을 확인한다.
--   SHOW CREATE TABLE orders;
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_orders_fk_set_null.sql;

ALTER TABLE orders
    DROP FOREIGN KEY fk_orders_user,
    DROP FOREIGN KEY fk_orders_receiver;

ALTER TABLE orders
    MODIFY COLUMN user_id     BIGINT NULL,
    MODIFY COLUMN receiver_id BIGINT NULL;

ALTER TABLE orders
    ADD CONSTRAINT fk_orders_user     FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_orders_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL;

-- [적용 후 확인]
-- 제약이 ON DELETE SET NULL로 바뀌었는지 확인한다.
SHOW CREATE TABLE orders;
