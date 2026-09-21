-- #122: 운영 실행은 별도 승인 필요. 백업/BE 중지 후 컬럼 존재 여부부터 확인한다.
-- SHOW COLUMNS FROM users LIKE 'auth_version';
-- 이미 있으면 재실행/값 초기화 금지. ALTER는 자동 커밋되며 기존 행도 기본값 1을 갖는다.
ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER password;

-- 적용 후 확인 (기존 데이터 삭제/seed 재실행 불필요)
SHOW COLUMNS FROM users LIKE 'auth_version';
SELECT COUNT(*) AS invalid_auth_versions FROM users WHERE auth_version IS NULL OR auth_version < 1;
-- 새 BE 배포 후 구 세션은 재로그인. 새 가입자의 DEFAULT 1도 검증한다.
