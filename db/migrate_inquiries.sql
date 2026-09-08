-- [목적] 이슈 #90(관리자 페이지) 8절에 따라 문의하기(일반 문의 + 제재 이의제기)를
-- 저장할 테이블을 추가한다.
--
-- [설계 기준]
-- - category는 'general' / 'sanction_appeal' 두 가지다. 관리자가 큐에서 빠르게
--   걸러볼 수 있도록 구분만 하고, 별도 테이블로 분리하지 않는다.
-- - status는 'pending' / 'answered' 두 가지다. reports(pending/dismissed/actioned),
--   user_sanctions(active/lifted)와 마찬가지로 CHECK 제약 없이 애플리케이션
--   검증으로만 값을 통제한다.
-- - user_id는 CASCADE다. reports.reporter_id/orders.user_id와 달리, 문의는 계정이
--   삭제된 뒤에도 남겨서 증거로 삼거나 이력을 보존해야 할 이유가 없는 개인 문의
--   기록이라 SET NULL로 보존할 실익이 없다.
--
-- [선행 조건]
-- - users 테이블이 존재해야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 테이블이 없는지 확인한다.
--   SHOW TABLES LIKE 'inquiries';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_inquiries.sql;

CREATE TABLE inquiries (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    category        VARCHAR(20) NOT NULL DEFAULT 'general',
    content         VARCHAR(1000) NOT NULL,
    admin_reply     VARCHAR(1000),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_inquiries_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_inquiries_status_created
    ON inquiries (status, created_at, id);

CREATE INDEX idx_inquiries_user_created
    ON inquiries (user_id, created_at, id);

-- [적용 후 확인]
SHOW CREATE TABLE inquiries;
SHOW INDEX FROM inquiries;
