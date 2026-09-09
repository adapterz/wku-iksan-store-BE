-- 이슈 #101: 선물 도착 안내 확인 상태. 개별 읽음/사용 상태가 아니다.
-- 운영 적용은 별도 승인 후 실행한다. seed 전체 재실행은 필요 없다.
-- 1. 백업 후 주문/선물 생성 요청을 중단하고 진행 중 요청도 종료됐는지 확인.
-- 2. 아래 컬럼 추가와 최초 백필을 차례로 적용/검증.
-- 3. BE 배포 및 API 확인 후 생성 요청 재개, FE 연동 확인.
-- 기존 notified_at 컬럼이 있는 DB에는 이 파일을 실행하지 않는다.
-- ALTER TABLE은 자동 커밋된다. 백필 실패 시 생성 중단을 유지하고 복구한다.
ALTER TABLE gifts ADD COLUMN notified_at DATETIME NULL;

-- 기존 행의 created_at은 실제 안내 확인 시각이 아닌 기존 알림 제외 초기값이다.
-- 최초 적용 전용: 재실행하면 신규 미확인 선물까지 제외되므로 절대 반복하지 않는다.
UPDATE gifts SET notified_at = created_at WHERE notified_at IS NULL;
