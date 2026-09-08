const pool = require('../pool');

// 관리자 대시보드용 상품 현황 — status='active'만 "지금 페이지에 있는 상품"으로 집계한다.
const getProductStats = async () => {
  const [totalRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM products WHERE status = 'active'"
  );
  const [byBrandRows] = await pool.query(`
    SELECT brand, COUNT(*) AS count
    FROM products
    WHERE status = 'active'
    GROUP BY brand
    ORDER BY count DESC, brand ASC
  `);
  // 관리자가 숨겨두고 잊어버린 상품이 없는지 확인하기 위한 카운트(단종은 별개 상태라 제외).
  const [hiddenRows] = await pool.query(
    "SELECT COUNT(*) AS total FROM products WHERE status = 'hidden'"
  );

  return {
    totalCount: Number(totalRows[0].total),
    byBrand: byBrandRows.map(row => ({ brand: row.brand, count: Number(row.count) })),
    hiddenCount: Number(hiddenRows[0].total)
  };
};

// 활성 정지 중인 회원 수 — 관리자가 오늘 신경 써야 할 규모를 파악하기 위한 지표.
// 정지 자연 만료는 status를 안 바꾸고 조회 시점의 ends_at으로 판단하는데, SQL의
// NOW()는 MySQL 서버 세션 타임존 기준이라 Node 프로세스 타임존과 다르면 오차가 생길
// 수 있어(db/models/sanctionModel.js의 createSanction 주석 참고) SQL에서 비교하지
// 않고 값을 그대로 읽어와 Node 프로세스 시계로 비교한다.
const countActiveSuspensions = async () => {
  const [rows] = await pool.query(
    "SELECT user_id, ends_at FROM user_sanctions WHERE type = 'suspension' AND status = 'active'"
  );
  const now = Date.now();
  const activeUserIds = new Set(
    rows.filter(row => new Date(row.ends_at).getTime() > now).map(row => row.user_id)
  );
  return activeUserIds.size;
};

module.exports = { getProductStats, countActiveSuspensions };
