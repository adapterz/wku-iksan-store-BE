-- [목적] 이슈 #90(관리자 페이지)에 따라 관리자 여부를 판별할 컬럼을 추가한다.
-- 관리자 전용 API는 requireAdmin 미들웨어가 이 컬럼을 매 요청마다 조회해서 확인하며,
-- 세션에는 캐싱하지 않는다(권한 회수가 즉시 반영돼야 하고, 세션 저장소가 MemoryStore라
-- 특정 세션을 강제로 무효화할 수 없기 때문).
--
-- [설계 기준]
-- - 관리자 여부는 role 컬럼으로 이분 판별한다 ('user' | 'admin'), 등급 세분화는 하지 않는다.
-- - 기존 유저는 전부 기본값 'user'로 채워진다.
--
-- [선행 조건]
-- - users 테이블이 존재해야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 신규 컬럼이 없는지 확인한다.
--   SHOW COLUMNS FROM users LIKE 'role';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_admin_role.sql;
--
-- 최초 관리자 부트스트랩은 이 파일로 자동 실행하지 않는다. 아래 UPDATE 예시의 이메일을
-- 실제 관리자가 될 팀원 계정의 진짜 이메일로 바꿔서 별도로 1건만 실행한다.
--   UPDATE users SET role = 'admin' WHERE email = '<실제 관리자 계정 이메일>';
-- 이후 추가 관리자는 PATCH /api/admin/users/:id/role API로 승격한다.

ALTER TABLE users
    ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user' AFTER password;

-- [적용 후 확인]
SHOW CREATE TABLE users;
SELECT id, email, role FROM users LIMIT 5;
