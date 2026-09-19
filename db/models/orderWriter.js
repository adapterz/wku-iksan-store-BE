const crypto = require('node:crypto');
const generateBarcode = () => String(crypto.randomInt(0, 1000000000000)).padStart(12, '0');
// INSERT만 수행한다. 커넥션/트랜잭션은 단건 또는 묶음 호출자가 소유한다.
async function insertOrderWithGift(connection, value, firstBarcode = generateBarcode()) {
  const [order] = await connection.query(`INSERT INTO orders
    (user_id, sender_nickname_snapshot, product_id, receiver_id, receiver_nickname_snapshot,
     total_price, message, is_self_gift, payment_status, order_group_id,
     product_name_snapshot, brand_snapshot, thumbnail_url_snapshot)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?, ?, ?)`,
  [value.userId, value.senderNickname, value.product.id, value.receiverId, value.receiverNickname,
    value.product.price, value.message, value.isSelfGift, value.orderGroupId || null,
    value.product.name, value.product.brand, value.product.thumbnail_url || null]);
  let barcode = firstBarcode;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const [gift] = await connection.query("INSERT INTO gifts (order_id, barcode, status) VALUES (?, ?, 'unused')", [order.insertId, barcode]);
      return { orderId: order.insertId, giftId: gift.insertId };
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || !String(error.sqlMessage || error.message).includes('uq_gifts_barcode') || attempt === 4) throw error;
      barcode = generateBarcode();
    }
  }
}

// 묶음 결제(장바구니 → 주문 그룹) 전용 배치 버전. 단건 주문(insertOrderWithGift)과
// 별도로 둔다 — 여러 상품/수량을 한 트랜잭션에서 처리하는 orderGroupModel.create만
// 사용하며, 단건 경로(orderModel.createOrderWithGift)의 동작·재시도 계약은 그대로 둔다.
//
// orders는 한 번의 다중 행 INSERT로 넣는다. 같은 INSERT 문 안에서 할당되는
// AUTO_INCREMENT 값은 innodb_autoinc_lock_mode 설정과 무관하게 항상 연속이므로
// (MySQL 매뉴얼 15.6.1.6 "Simple inserts"), insertId(첫 값)에 순번을 더해 각 행의
// id를 안전하게 계산할 수 있다.
//
// gifts는 바코드 UNIQUE 제약 때문에 충돌 시 개별 행이 아니라 이 배치 INSERT 문
// 전체가 실패한다(IGNORE를 쓰지 않는 한 InnoDB는 실패한 다중 행 INSERT 문 전체를
// 그 문장 단위로 롤백한다) — 그래서 재시도도 문장 단위로, 바코드 전체를 다시
// 뽑아서 다시 시도한다(단건 경로의 바코드 재시도 5회 상한과 동일). orders는 이미
// 커밋 전 트랜잭션 안에 남아있으므로 다시 넣지 않는다.
async function insertOrdersWithGiftsBatch(connection, values) {
  if (values.length === 0) return [];

  const orderValuesSql = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, \'paid\', ?, ?, ?, ?)').join(', ');
  const orderParams = values.flatMap(value => [
    value.userId, value.senderNickname, value.product.id, value.receiverId, value.receiverNickname,
    value.product.price, value.message, value.isSelfGift, value.orderGroupId || null,
    value.product.name, value.product.brand, value.product.thumbnail_url || null
  ]);
  const [orderResult] = await connection.query(`INSERT INTO orders
    (user_id, sender_nickname_snapshot, product_id, receiver_id, receiver_nickname_snapshot,
     total_price, message, is_self_gift, payment_status, order_group_id,
     product_name_snapshot, brand_snapshot, thumbnail_url_snapshot)
    VALUES ${orderValuesSql}`, orderParams);
  const orderIds = values.map((_, index) => orderResult.insertId + index);

  for (let attempt = 0; attempt < 5; attempt++) {
    const barcodes = values.map(() => generateBarcode());
    try {
      const giftValuesSql = values.map(() => '(?, ?, \'unused\')').join(', ');
      const giftParams = orderIds.flatMap((orderId, index) => [orderId, barcodes[index]]);
      const [giftResult] = await connection.query(
        `INSERT INTO gifts (order_id, barcode, status) VALUES ${giftValuesSql}`, giftParams
      );
      return orderIds.map((orderId, index) => ({ orderId, giftId: giftResult.insertId + index }));
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || !String(error.sqlMessage || error.message).includes('uq_gifts_barcode') || attempt === 4) throw error;
    }
  }
}

module.exports = { generateBarcode, insertOrderWithGift, insertOrdersWithGiftsBatch };
