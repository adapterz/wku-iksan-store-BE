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
module.exports = { generateBarcode, insertOrderWithGift };
