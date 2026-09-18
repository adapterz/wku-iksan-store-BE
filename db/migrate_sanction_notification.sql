-- [목적] 이슈 #97 "경고 안내 방식" 결정에 따라, 경고를 받은 유저가 알림함에서
-- 확인하고 최초 로그인 시 1회 토스트로 안내받을 수 있도록 확인 시각을 저장한다.
--
-- [설계] db/migrate_gift_notifications.sql과 동일한 패턴이다.
-- - notified_at은 조회만으로는 바뀌지 않고, 유저가 명시적으로 확인 처리해야 채워진다.
-- - 대상은 type = 'warning'뿐이다. 정지(suspension) 안내는 이번 범위에 포함하지
--   않는다(이슈 #97 코멘트에 정지 안내는 언급되지 않음).
-- - 해제(lifted)된 경고도 안내 대상에서 제외하지 않는다. 경고를 받았다는 사실
--   자체는 취소 여부와 무관하게 안내한다(countWarnings이 lifted도 계속 카운트하는
--   기존 정책과 같은 결).
--
-- [선행 조건] user_sanctions 테이블이 존재해야 한다(db/migrate_user_sanctions.sql).
-- 실행 전 운영 DB를 백업하고 아래 쿼리로 컬럼이 없는지 확인한다.
--   SHOW COLUMNS FROM user_sanctions LIKE 'notified_at';
--
-- [실행 방법]
--   SOURCE db/migrate_sanction_notification.sql;

ALTER TABLE user_sanctions
  ADD COLUMN notified_at DATETIME NULL AFTER status;

-- [적용 후 확인]
SHOW COLUMNS FROM user_sanctions LIKE 'notified_at';
SELECT COUNT(*) AS existing_unnotified_warnings
  FROM user_sanctions WHERE type = 'warning' AND notified_at IS NULL;
