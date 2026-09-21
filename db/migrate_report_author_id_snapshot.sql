-- [목적] 이슈 #97 BE-1 (1b) — 리뷰가 삭제된 신고도 작성자 id를 확인할 수 있도록,
-- 신고 접수 시점에 리뷰 작성자 id를 스냅샷으로 보관한다.
--
-- [배경] reports.review_id는 리뷰 삭제 시 ON DELETE SET NULL로 끊어진다. 1a에서
-- reports를 reviews와 LEFT JOIN해 author_id를 내려주게 했지만, review_id가 NULL이
-- 되면 이 JOIN도 끊겨 리뷰가 삭제된 신고는 author_id를 알 수 없다.
--
-- [설계]
-- - review_author_id_snapshot은 신고 접수 시점의 작성자 id를 그대로 저장한다.
--   신고 목록 조회 시 COALESCE(rv.user_id, r.review_author_id_snapshot)로 계산해,
--   리뷰가 살아있으면 실시간 값을, 삭제됐으면 스냅샷 값을 author_id로 내려준다.
-- - FK는 SET NULL이다. 작성자가 계정을 탈퇴해도(PR #82) 신고 기록 자체는 남아야
--   하고, author_id가 NULL이 되는 건 review_id가 NULL일 때와 동일하게 처리된다.
-- - 스냅샷 도입 이전에 이미 리뷰가 삭제된 기존 신고는 백필할 수 없어 NULL로
--   남는다. 이 건들을 "확인 불가"로 별도 표시하는 기능은 만들지 않기로
--   합의됐다(#97 코멘트 참고) — 현재 해당 데이터가 없고 실사용자가 없어 발생
--   가능성도 낮다고 판단.
--
-- [선행 조건] reports, reviews, users 테이블이 존재해야 한다.
-- 실행 전 운영 DB를 백업하고 아래 쿼리로 컬럼이 없는지 확인한다.
--   SHOW COLUMNS FROM reports LIKE 'review_author_id_snapshot';
--
-- [실행 방법]
-- MySQL 콘솔에서 프로젝트 경로를 기준으로 실행한다.
--   SOURCE db/migrate_report_author_id_snapshot.sql;

ALTER TABLE reports
  ADD COLUMN review_author_id_snapshot BIGINT AFTER reporter_id,
  ADD CONSTRAINT fk_reports_author_snapshot
      FOREIGN KEY (review_author_id_snapshot) REFERENCES users(id) ON DELETE SET NULL;

-- 리뷰가 아직 살아있는 기존 신고는 지금 시점 작성자 id로 백필한다.
-- 이미 리뷰가 삭제된 신고(review_id IS NULL)는 대상에서 제외되어 NULL로 남는다.
UPDATE reports r
JOIN reviews rv ON rv.id = r.review_id
SET r.review_author_id_snapshot = rv.user_id
WHERE r.review_id IS NOT NULL;

-- [적용 후 확인]
SHOW COLUMNS FROM reports LIKE 'review_author_id_snapshot';
SELECT COUNT(*) AS backfilled FROM reports WHERE review_author_id_snapshot IS NOT NULL;
SELECT COUNT(*) AS unrecoverable FROM reports WHERE review_id IS NULL AND review_author_id_snapshot IS NULL;
