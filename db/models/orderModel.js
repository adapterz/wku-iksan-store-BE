const pool = require('../pool');

// 주문과 선물은 하나의 거래이므로 같은 DB 연결과 트랜잭션에서 함께 처리한다.
const createOrderWithGift = async (
  userId,
  productId,
  receiverId,
  totalPrice,
  message,
  isSelfGift,
  barcode
) => {
  const connection = await pool.getConnection();
  let transactionStarted = false;

  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [orderResult] = await connection.query(
      `INSERT INTO orders
        (user_id, product_id, receiver_id, total_price, message, is_self_gift, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, productId, receiverId, totalPrice, message, isSelfGift, 'paid']
    );

    const [giftResult] = await connection.query(
      `INSERT INTO gifts (order_id, barcode, status) VALUES (?, ?, ?)`,
      [orderResult.insertId, barcode, 'unused']
    );

    await connection.commit();

    return {
      orderId: orderResult.insertId,
      giftId: giftResult.insertId
    };
  } catch (error) {
    // 두 INSERT 중 하나라도 실패하면 먼저 저장된 데이터까지 모두 취소한다.
    if (transactionStarted) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('Order transaction rollback failed:', rollbackError);
      }
    }
    throw error;
  } finally {
    // 성공·실패 여부와 관계없이 풀에서 빌린 연결을 반드시 반환한다.
    connection.release();
  }
};

const getOrderById = async (orderId) => {
  const [rows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
  return rows.length > 0 ? rows[0] : null;
};

const getGiftByOrderId = async (orderId) => {
  const [rows] = await pool.query('SELECT * FROM gifts WHERE order_id = ?', [orderId]);
  return rows.length > 0 ? rows[0] : null;
};

module.exports = {
  createOrderWithGift,
  getOrderById,
  getGiftByOrderId
};
