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
// 호출자는 values 전체에 동일한 orderGroupId(새로 만든 주문 그룹)를 채워서 넘겨야 한다.
//
// orders/gifts 모두 한 번의 다중 행 INSERT로 넣는다. 같은 INSERT 문 안에서 할당되는
// AUTO_INCREMENT 값은 행 순서대로 증가하지만, 그 증가폭은 insertId+index가 아니라
// auto_increment_increment(자동 증가 간격) 설정을 따른다 — 이 값이 1이 아니면(복제
// 구성 등에서 흔히 2 이상으로 씀) insertId+index로 계산한 id가 실제 발급된 id와
// 어긋나 gifts.order_id FK가 잘못 연결된다(PR #133 리뷰에서 재현 확인). 그래서 값을
// 계산하지 않고, 방금 넣은 행을 다시 조회해 실제 id를 가져와 연결한다. order_group_id는
// 이 트랜잭션에서 새로 만든 값이라 다른 트랜잭션의 행과 섞이지 않는다.
//
// gifts는 바코드 UNIQUE 제약 때문에 충돌 시 개별 행이 아니라 이 배치 INSERT 문
// 전체가 실패한다(IGNORE를 쓰지 않는 한 InnoDB는 실패한 다중 행 INSERT 문 전체를
// 그 문장 단위로 롤백한다) — 그래서 재시도도 문장 단위로, 바코드 전체를 다시
// 뽑아서 다시 시도한다(단건 경로의 바코드 재시도 5회 상한과 동일). orders는 이미
// 커밋 전 트랜잭션 안에 남아있으므로 다시 넣지 않는다.
async function insertOrdersWithGiftsBatch(connection, values) {
  if (values.length === 0) return [];

  const orderGroupId = values[0].orderGroupId;
  const orderValuesSql = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, \'paid\', ?, ?, ?, ?)').join(', ');
  const orderParams = values.flatMap(value => [
    value.userId, value.senderNickname, value.product.id, value.receiverId, value.receiverNickname,
    value.product.price, value.message, value.isSelfGift, value.orderGroupId || null,
    value.product.name, value.product.brand, value.product.thumbnail_url || null
  ]);
  await connection.query(`INSERT INTO orders
    (user_id, sender_nickname_snapshot, product_id, receiver_id, receiver_nickname_snapshot,
     total_price, message, is_self_gift, payment_status, order_group_id,
     product_name_snapshot, brand_snapshot, thumbnail_url_snapshot)
    VALUES ${orderValuesSql}`, orderParams);
  const [orderRows] = await connection.query(
    'SELECT id FROM orders WHERE order_group_id = ? ORDER BY id', [orderGroupId]
  );
  const orderIds = orderRows.map(row => row.id);

  for (let attempt = 0; attempt < 5; attempt++) {
    const barcodes = values.map(() => generateBarcode());
    try {
      const giftValuesSql = values.map(() => '(?, ?, \'unused\')').join(', ');
      const giftParams = orderIds.flatMap((orderId, index) => [orderId, barcodes[index]]);
      await connection.query(
        `INSERT INTO gifts (order_id, barcode, status) VALUES ${giftValuesSql}`, giftParams
      );
      const [giftRows] = await connection.query(
        `SELECT id, order_id FROM gifts WHERE order_id IN (${orderIds.map(() => '?').join(',')})`, orderIds
      );
      const giftIdByOrderId = new Map(giftRows.map(row => [row.order_id, row.id]));
      return orderIds.map(orderId => ({ orderId, giftId: giftIdByOrderId.get(orderId) }));
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY' || !String(error.sqlMessage || error.message).includes('uq_gifts_barcode') || attempt === 4) throw error;
    }
  }
}

module.exports = { generateBarcode, insertOrderWithGift, insertOrdersWithGiftsBatch };
