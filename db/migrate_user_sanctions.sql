-- [목적] 이슈 #90(관리자 페이지) 7절에 따라 회원 제재(경고/정지) 이력을 저장할
-- 테이블을 추가한다.
--
-- [설계 기준]
-- - type은 'warning'(경고) / 'suspension'(정지) 두 가지뿐이다. 경고는 ends_at이
--   NULL이고 아무 기능도 제한하지 않는다(기록만 남음). 정지는 ends_at(종료 시각)이
--   필수이며 리뷰 작성만 제한한다(로그인 등 다른 기능은 막지 않음). 이 제한 로직
--   자체(POST /api/reviews 훅)는 이번 마이그레이션 범위 밖이며 후속 작업이다.
-- - 이미 경고가 1건 이상 있는 유저에게 또 경고를 주려는 요청은 애플리케이션
--   레벨에서 막는다(자동으로 정지로 바뀌지 않고, 관리자가 명시적으로 정지를
--   다시 요청하도록 유도 — WARNING_LIMIT_EXCEEDED).
-- - status는 'active' / 'lifted'(이의제기 승인으로 조기 해제) 두 가지. 정지의
--   자연 만료는 상태값을 바꾸지 않고 조회 시점에 ends_at과 현재 시각을 비교해
--   판단한다.
-- - 이 프로젝트는 CHECK 제약을 reviews 테이블에만 우선 적용하기로 했으므로
--   (#77 참고), 여기서도 CHECK를 걸지 않고 애플리케이션 검증으로만 통제한다.
-- - issued_by는 SET NULL이다. 제재를 내린 관리자가 나중에 계정을 하드 삭제해도
--   (PR #82) 제재 기록 자체는 남아야 한다.
-- - user_id는 CASCADE다. 제재 기록은 그 유저에 대한 것이라 유저가 탈퇴하면 의미가
--   없어진다. 다만 이 때문에 정지당한 유저가 탈퇴 후 재가입으로 제재를 피할 수
--   있는 문제가 남는데, 이는 계정 삭제 API에 활성 정지 확인을 추가하는 후속
--   작업(#90 7-5절)에서 막는다. 이번 마이그레이션에는 포함되지 않는다.
--
-- [선행 조건]
-- - users 테이블이 존재해야 한다.
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 테이블이 없는지 확인한다.
--   SHOW TABLES LIKE 'user_sanctions';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_user_sanctions.sql;

CREATE TABLE user_sanctions (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT NOT NULL,
    type            VARCHAR(20) NOT NULL,
    reason          VARCHAR(500) NOT NULL,
    issued_by       BIGINT,
    ends_at         DATETIME,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_sanctions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_sanctions_admin
        FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_sanctions_user_created
    ON user_sanctions (user_id, created_at, id);

-- [적용 후 확인]
SHOW CREATE TABLE user_sanctions;
SHOW INDEX FROM user_sanctions;
