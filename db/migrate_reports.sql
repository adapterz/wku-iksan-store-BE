-- [목적] 이슈 #90(관리자 페이지) 6절에 따라 리뷰 신고를 저장할 테이블을 추가한다.
-- 신고 대상은 초기에는 리뷰만 지원한다(사용자·상품 신고는 범위 밖).
--
-- [설계 기준]
-- - 동일 사용자가 같은 리뷰를 중복 신고하지 못하도록 UNIQUE(review_id, reporter_id).
-- - review_id/reporter_id는 CASCADE가 아니라 SET NULL이다. 리뷰는 작성자가 언제든
--   삭제할 수 있는데, CASCADE로 두면 신고당한 사람이 관리자가 처리하기 전에 자기
--   리뷰를 지우는 것만으로 신고 기록 자체가 사라져 제재를 피할 수 있다. 신고 시점의
--   리뷰 내용(review_content_snapshot, review_rating_snapshot)을 스냅샷으로 같이
--   저장해두면, 원본 리뷰나 신고자 계정이 나중에 사라져도 신고 기록과 증거는 그대로
--   남는다(주문 닉네임 스냅샷과 같은 패턴).
-- - status는 'pending' / 'dismissed' / 'actioned' 세 가지다. 이 프로젝트는 CHECK
--   제약을 reviews 테이블에만 우선 적용하기로 했으므로(#77 참고), 여기서는 CHECK를
--   걸지 않고 애플리케이션 검증으로만 값을 통제한다.
--
-- [선행 조건]
-- - reviews, users 테이블이 존재해야 한다(migrate_reviews.sql 선행 적용 필요).
-- - 실행 전 운영 DB를 백업하고 아래 쿼리로 테이블이 없는지 확인한다.
--   SHOW TABLES LIKE 'reports';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_reports.sql;

CREATE TABLE reports (
    id                       BIGINT AUTO_INCREMENT PRIMARY KEY,
    review_id                BIGINT,
    reporter_id              BIGINT,
    review_content_snapshot  VARCHAR(1000) NOT NULL,
    review_rating_snapshot   TINYINT NOT NULL,
    reason                   VARCHAR(500) NOT NULL,
    status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_reports_review_reporter UNIQUE (review_id, reporter_id),
    CONSTRAINT fk_reports_review
        FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE SET NULL,
    CONSTRAINT fk_reports_reporter
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_reports_status_created
    ON reports (status, created_at, id);

-- [적용 후 확인]
SHOW CREATE TABLE reports;
SHOW INDEX FROM reports;
