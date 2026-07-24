-- [목적] users.nickname 컬럼의 collation을 환경별로 통일한다.
-- [배경] 로컬 DB(iksanshop)에서는 nickname 컬럼이 이미 utf8mb4_unicode_ci(대소문자 비구분)로
-- 설정되어 있어 "abc"와 "ABC"가 이미 같은 값으로 취급되고 uq_users_nickname UNIQUE 제약도
-- 이미 대소문자를 무시하고 중복을 차단한다. 다만 환경마다(운영 DB 등) 실제 collation이
-- 다를 수 있으므로, 모든 환경에서 동일하게 대소문자 비구분으로 동작하도록
-- utf8mb4_0900_ai_ci로 명시적으로 통일한다.
--
-- [사전 점검] 이 스크립트 실행 전, 대소문자만 다른 중복 닉네임이 있는지 반드시 확인한다.
-- 중복이 있으면 ALTER TABLE이 실패하므로, 발견 시 임의로 데이터를 수정하지 말고
-- 처리 방침을 먼저 결정한 뒤 진행한다.
--   SELECT LOWER(nickname), COUNT(*) FROM users GROUP BY LOWER(nickname) HAVING COUNT(*) > 1;
--
-- [실행 방법] MySQL 콘솔에서 SOURCE 명령으로 실행한다 (인코딩 유실 방지, docs/DB/DEVLOG.md 참고).
--   mysql> SOURCE db/migrate_nickname_collation.sql;
--
-- [영향 범위] nickname 컬럼의 collation만 변경되며, uq_users_nickname UNIQUE 제약과
-- NOT NULL 제약은 그대로 유지된다 (ALTER TABLE MODIFY COLUMN은 기존 인덱스/제약을 보존한다).
--
-- [운영 반영 주의] 운영 DB에 반영하기 전 반드시 DB 백업을 먼저 수행할 것.
-- 이 스크립트 자체는 운영 DB에 대해 실행하지 않았으며, 운영 반영은 팀 검증 후 별도로 진행한다.

ALTER TABLE users
    MODIFY COLUMN nickname VARCHAR(50) COLLATE utf8mb4_0900_ai_ci NOT NULL;
