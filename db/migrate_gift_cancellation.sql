-- #153: 수신자가 미사용 교환권을 처음 취소한 시각. 취소 이력이 없으면 NULL.
-- 기존 DB에서 gifts.cancelled_at이 없는 경우 한 번만 실행한다.
-- 기존 교환권 상태·사용 시각과 주문 금액은 변경하지 않는다. 백필·seed 재실행 불필요.
ALTER TABLE gifts ADD COLUMN cancelled_at DATETIME NULL;
