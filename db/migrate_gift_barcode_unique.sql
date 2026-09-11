-- #94: 먼저 SELECT barcode, COUNT(*) FROM gifts GROUP BY barcode HAVING COUNT(*) > 1 로 확인.
-- 중복이 있으면 실행을 중단하고 협의한다. 기존 바코드를 임의로 변경/삭제하지 않는다.
-- UNIQUE 추가 자체도 중복이 있으면 실패한다. 오류 무시 옵션 없이 실행.
ALTER TABLE gifts ADD CONSTRAINT uq_gifts_barcode UNIQUE (barcode);
