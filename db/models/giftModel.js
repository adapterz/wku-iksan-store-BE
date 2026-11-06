// receiverId 기준 조회, 발신자(sender) 닉네임은 탈퇴·닉네임 변경 이후에도 주문 당시
// 값을 그대로 보여주기 위해 users 테이블이 아니라 orders.sender_nickname_snapshot을 사용한다.
const pool = require('../pool');
const { transaction, lockUsers } = require('./cartTransaction');

// 사용 여부/발신자의 현재 계정 존재 여부와 도착 안내 확인 여부는 별개다.
const RECEIVED_FROM_OTHER = `o.receiver_id = ? AND o.is_self_gift = false`;
const ACTIVE_GIFT = `o.payment_status = 'paid' AND g.status IN ('unused', 'used')`;
const CANCELLED_GIFT = `o.payment_status = 'cancelled' AND g.status = 'cancelled'`;

// 탈퇴 트랜잭션에서 해당 users 행을 먼저 잠근 뒤 호출한다.
// 주문 경로도 같은 회원 잠금을 사용하므로 확인~삭제 사이에 새 선물이 들어올 수 없다.
// FOR UPDATE는 기존 스냅샷이 아닌 최신 커밋 상태를 읽는다. 목록 화면용 상품/리뷰 조인은 불필요하다.
const hasUnusedGiftsForUpdate = async (receiverId, connection) => {
  const [rows] = await connection.query(`
    SELECT g.id FROM orders o JOIN gifts g ON g.order_id = o.id
    WHERE o.receiver_id = ? AND o.payment_status = 'paid' AND g.status = 'unused'
    LIMIT 1 FOR UPDATE`, [receiverId]);
  return rows.length > 0;
};

const getUnnotifiedGiftIds = async (receiverId) => {
  const [rows] = await pool.query(`
    SELECT g.id FROM gifts g JOIN orders o ON g.order_id = o.id
    WHERE ${RECEIVED_FROM_OTHER} AND ${ACTIVE_GIFT} AND g.notified_at IS NULL
    ORDER BY g.id ASC`, [receiverId]);
  return rows.map(row => row.id);
};

const notifyGifts = async (receiverId, giftIds) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await lockUsers(connection, receiverId);
    const placeholders = giftIds.map(() => '?').join(',');
    // 이미 확인한 행도 포함하여 재시도를 허용한다. 주문/선물 잠금을 유지한 채
    // 전체 소유권·결제 조건을 검증하므로 잘못된 ID 혼합 시 일부 갱신하지 않는다.
    const [rows] = await connection.query(`
      SELECT g.id, g.status FROM gifts g JOIN orders o ON g.order_id = o.id
      WHERE ${RECEIVED_FROM_OTHER} AND ((${ACTIVE_GIFT}) OR (${CANCELLED_GIFT}))
        AND g.id IN (${placeholders})
      ORDER BY g.id ASC FOR UPDATE`, [receiverId, ...giftIds]);
    if (rows.length !== giftIds.length) {
      await connection.rollback();
      return false;
    }
    // 알림 조회 이후 취소된 선물은 요청에는 포함하되 확인 시각은 쓰지 않는다.
    const activeIds = rows.filter(row => row.status !== 'cancelled').map(row => row.id);
    if (activeIds.length) {
      await connection.query(`
        UPDATE gifts SET notified_at = CURRENT_TIMESTAMP
        WHERE id IN (${activeIds.map(() => '?').join(',')}) AND notified_at IS NULL`, activeIds);
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getGiftsByReceiverId = async (receiverId, status) => {
  let query = `
    SELECT
      g.id as gift_id,
      p.id as product_id,
      o.receiver_id,
      o.payment_status,
      r.id as review_id,
      COALESCE(o.product_name_snapshot, p.name) as product_name,
      CASE WHEN o.product_name_snapshot IS NOT NULL THEN o.thumbnail_url_snapshot ELSE p.thumbnail_url END as thumbnail_url,
      COALESCE(o.brand_snapshot, p.brand) as brand,
      g.status as status,
      o.sender_nickname_snapshot as sender_nickname,
      o.is_self_gift as is_self_gift,
      g.created_at as created_at,
      g.used_at as used_at,
      g.cancelled_at
    FROM gifts g
    JOIN orders o ON g.order_id = o.id
    JOIN products p ON o.product_id = p.id
    LEFT JOIN reviews r ON r.gift_id = g.id
    WHERE o.receiver_id = ? AND ${status === 'cancelled' ? CANCELLED_GIFT : ACTIVE_GIFT}
  `;
  const params = [receiverId];

  if (status === 'unused' || status === 'used') {
    query += ` AND g.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY g.created_at DESC`;

  const [rows] = await pool.query(query, params);
  return rows;
};

const getGiftDetailById = async (giftId) => {
  const query = `
    SELECT
      g.id as gift_id,
      p.id as product_id,
      o.payment_status,
      r.id as review_id,
      COALESCE(o.product_name_snapshot, p.name) as product_name,
      CASE WHEN o.product_name_snapshot IS NOT NULL THEN o.thumbnail_url_snapshot ELSE p.thumbnail_url END as thumbnail_url,
      g.barcode,
      g.status,
      g.used_at,
      g.cancelled_at,
      o.message,
      o.receiver_id,
      o.is_self_gift,
      o.user_id as sender_id,
      o.sender_nickname_snapshot as sender_nickname
    FROM gifts g
    JOIN orders o ON g.order_id = o.id
    JOIN products p ON o.product_id = p.id
    LEFT JOIN reviews r ON r.gift_id = g.id
    WHERE g.id = ?
  `;
  const [rows] = await pool.query(query, [giftId]);
  return rows.length > 0 ? rows[0] : null;
};

// 탈퇴와 같은 순서로 수신자 행부터 잠근다. 사용·취소 모두 잠금 이후의 상태로 판단한다.
function transitionGift(receiverId, giftId, cancel) {
  return transaction(async connection => {
    await lockUsers(connection, receiverId);
    const [[gift]] = await connection.query(`
      SELECT g.order_id, g.status, g.cancelled_at, o.receiver_id, o.payment_status
      FROM gifts g JOIN orders o ON o.id = g.order_id
      WHERE g.id = ? FOR UPDATE`, [giftId]);
    if (!gift) return { errorCode: 'GIFT_NOT_FOUND' };
    if (String(gift.receiver_id) !== String(receiverId)) return { errorCode: 'FORBIDDEN_NOT_OWNER' };
    if (gift.status === 'cancelled') {
      if (!cancel) return { errorCode: 'GIFT_CANCELLED' };
      if (gift.payment_status !== 'cancelled' || !gift.cancelled_at) return { errorCode: 'GIFT_NOT_CANCELLABLE' };
      return { data: { giftId, status: 'cancelled', cancelledAt: gift.cancelled_at } };
    }
    if (gift.status === 'used') return { errorCode: 'GIFT_ALREADY_USED' };
    if (gift.status !== 'unused' || gift.payment_status !== 'paid') {
      return { errorCode: cancel ? 'GIFT_NOT_CANCELLABLE' : 'GIFT_NOT_USABLE' };
    }
    if (cancel) {
      const [order] = await connection.query(
        "UPDATE orders SET payment_status = 'cancelled' WHERE id = ? AND payment_status = 'paid'", [gift.order_id]);
      if (order.affectedRows !== 1) throw new Error('Order state changed while locked');
    }
    const [updated] = await connection.query(cancel
      ? "UPDATE gifts SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'unused'"
      : "UPDATE gifts SET status = 'used', used_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'unused'", [giftId]);
    if (updated.affectedRows !== 1) throw new Error('Gift state changed while locked');
    const [[row]] = await connection.query('SELECT status, used_at, cancelled_at FROM gifts WHERE id = ?', [giftId]);
    return { data: cancel ? { giftId, status: row.status, cancelledAt: row.cancelled_at }
      : { giftId, status: row.status, usedAt: row.used_at } };
  });
}
const useGift = (receiverId, giftId) => transitionGift(receiverId, giftId, false);
const cancelGift = (receiverId, giftId) => transitionGift(receiverId, giftId, true);

module.exports = {
  hasUnusedGiftsForUpdate,
  getUnnotifiedGiftIds,
  notifyGifts,
  getGiftsByReceiverId,
  getGiftDetailById,
  useGift,
  cancelGift
};
