-- [목적] 이슈 #72 논의에 따라 계정 하드 삭제 지원(orders FK를 ON DELETE SET NULL로
-- 전환)의 선행 작업으로, 주문 당시 발신자/수신자 닉네임을 orders 테이블에 스냅샷으로
-- 저장한다. user_id/receiver_id가 이후 탈퇴로 NULL이 되거나 닉네임이 바뀌더라도,
-- 주문 시점에 누구였는지는 이 스냅샷 컬럼으로 계속 확인할 수 있다.
--
-- [설계 기준]
-- - sender_nickname_snapshot / receiver_nickname_snapshot을 users.nickname과 동일한
--   VARCHAR(50)으로 추가한다.
-- - 기존 주문은 users 테이블과 조인해 현재 닉네임으로 백필한다.
-- - 백필 완료 후 NOT NULL 제약을 건다 (신규 주문은 저장 시점에 반드시 값을 채워야 함).
-- - FK를 nullable + ON DELETE SET NULL로 바꾸는 작업은 이후 단계에서 별도로 진행한다.
--
-- [선행 조건]
-- - orders, users 테이블이 존재해야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 신규 컬럼이 없는지 확인한다.
--   SHOW COLUMNS FROM orders LIKE 'sender_nickname_snapshot';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_order_nickname_snapshot.sql;

ALTER TABLE orders
    ADD COLUMN sender_nickname_snapshot   VARCHAR(50) AFTER user_id,
    ADD COLUMN receiver_nickname_snapshot VARCHAR(50) AFTER receiver_id;

UPDATE orders o
    JOIN users sender ON o.user_id = sender.id
    JOIN users receiver ON o.receiver_id = receiver.id
SET
    o.sender_nickname_snapshot = sender.nickname,
    o.receiver_nickname_snapshot = receiver.nickname;

ALTER TABLE orders
    MODIFY COLUMN sender_nickname_snapshot   VARCHAR(50) NOT NULL,
    MODIFY COLUMN receiver_nickname_snapshot VARCHAR(50) NOT NULL;

-- [적용 후 확인]
-- 아래 명령으로 컬럼 구성과 백필된 값을 확인한다.
SHOW CREATE TABLE orders;
SELECT id, user_id, sender_nickname_snapshot, receiver_id, receiver_nickname_snapshot FROM orders LIMIT 5;
