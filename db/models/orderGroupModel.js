const pool = require('../pool');
const { transaction, lockUsers } = require('./cartTransaction');
const { insertOrdersWithGiftsBatch } = require('./orderWriter');
const { reject } = require('../../validators/cartValidator');

async function loadDetail(group, runner) {
  const [rows] = await runner.query(`SELECT o.id AS order_id, o.product_id, o.total_price,
    o.product_name_snapshot, o.brand_snapshot, o.thumbnail_url_snapshot, g.id AS gift_id
    FROM orders o JOIN gifts g ON g.order_id = o.id
    WHERE o.order_group_id = ? ORDER BY o.id`, [group.id]);
  const items = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.product_id, row.total_price, row.product_name_snapshot, row.brand_snapshot, row.thumbnail_url_snapshot]);
    if (!items.has(key)) items.set(key, { productId: row.product_id, name: row.product_name_snapshot,
      brand: row.brand_snapshot, thumbnailUrl: row.thumbnail_url_snapshot, quantity: 0,
      unitPrice: Number(row.total_price), subtotal: 0, units: [] });
    const item = items.get(key);
    item.quantity++;
    item.subtotal += Number(row.total_price);
    item.units.push({ orderId: row.order_id, giftId: row.gift_id });
  }
  return { orderGroupId: group.id, sender: { userId: group.user_id, nickname: group.sender_nickname_snapshot },
    receiver: { userId: group.receiver_id, nickname: group.receiver_nickname_snapshot },
    isSelfGift: !!group.is_self_gift, message: group.message, totalPrice: Number(group.total_price),
    totalQuantity: rows.length, paymentStatus: group.payment_status, createdAt: group.created_at,
    items: [...items.values()] };
}
async function findRequest(runner, userId, key, locking = false) {
  const [rows] = await runner.query('SELECT * FROM order_groups WHERE user_id = ? AND idempotency_key = ?' + (locking ? ' FOR UPDATE' : ''), [userId, key]);
  return rows[0] || null;
}
async function replay(group, hash, runner) {
  if (group.request_hash !== hash) reject('IDEMPOTENCY_KEY_REUSED');
  return loadDetail(group, runner);
}
async function get(userId, id) {
  const [rows] = await pool.query('SELECT * FROM order_groups WHERE id = ? AND user_id = ?', [id, userId]);
  if (!rows.length) reject('ORDER_GROUP_NOT_FOUND');
  return loadDetail(rows[0], pool);
}
// 호출자의 트랜잭션 안에서만 실행한다. 장바구니 조회·삭제는 이 공통 함수에 넣지 않는다.
async function insertGroup(connection, userId, body, users, items, total) {
  const sender = users.get(userId), receiver = users.get(body.receiverId);
  const [result] = await connection.query(`INSERT INTO order_groups
    (user_id, receiver_id, sender_nickname_snapshot, receiver_nickname_snapshot, message,
     is_self_gift, total_price, payment_status, idempotency_key, request_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, ?)`,
  [userId, body.receiverId, sender.nickname, receiver.nickname, body.message, body.isSelfGift, total, body.key, body.hash]);
  const units = [];
  for (const item of items) {
    for (let count = 0; count < item.quantity; count++) {
      units.push({ userId, senderNickname: sender.nickname,
        receiverId: body.receiverId, receiverNickname: receiver.nickname, product: item.product,
        message: body.message, isSelfGift: body.isSelfGift, orderGroupId: result.insertId });
    }
  }
  await insertOrdersWithGiftsBatch(connection, units);
  return result.insertId;
}

async function createDirect(userId, body) {
  const previous = await findRequest(pool, userId, body.key);
  if (previous) return replay(previous, body.hash, pool);
  return transaction(async connection => {
    const users = await lockUsers(connection, userId, body.receiverId, false);
    // 동시 요청은 회원 잠금 후 최신 읽기로 재확인. 성공 주문은 이후 상품/수신자 변경에도 복원한다.
    const existing = await findRequest(connection, userId, body.key, true);
    if (existing) return replay(existing, body.hash, connection);
    if (!users.has(body.receiverId)) reject('RECEIVER_NOT_FOUND');
    const [products] = await connection.query('SELECT id, name, brand, thumbnail_url, price, status FROM products WHERE id = ? FOR UPDATE', [body.productId]);
    if (!products.length) reject('PRODUCT_NOT_FOUND');
    const product = products[0];
    if (product.status !== 'active') reject('PRODUCT_UNAVAILABLE');
    if (!Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 2147483647) reject('INVALID_PRODUCT_PRICE');
    if (product.price !== body.expectedUnitPrice) reject('PRODUCT_PRICE_CHANGED');
    const total = product.price * body.quantity;
    if (!Number.isSafeInteger(total) || total <= 0) reject('INVALID_PRODUCT_PRICE');
    const groupId = await insertGroup(connection, userId, body, users, [{ product, quantity: body.quantity }], total);
    const [groups] = await connection.query('SELECT * FROM order_groups WHERE id = ?', [groupId]);
    return loadDetail(groups[0], connection);
  });
}
async function create(userId, body) {
  const previous = await findRequest(pool, userId, body.key);
  if (previous) return replay(previous, body.hash, pool);
  return transaction(async connection => {
    const users = await lockUsers(connection, userId, body.receiverId, false);
    // 같은 회원의 주문 완료를 기다린 후에는 최신 읽기. 삭제된 장바구니를 먼저 검사하지 않는다.
    const existing = await findRequest(connection, userId, body.key, true);
    if (existing) return replay(existing, body.hash, connection);
    if (!users.has(body.receiverId)) reject('RECEIVER_NOT_FOUND');
    // 카트 아이템/상품을 건별로 조회하던 것을 IN(...) 한 번으로 묶는다. 잠금 순서는
    // ORDER BY id로 그대로 유지해 기존 데드락 방지 정책을 깨지 않는다. 반환 순서는
    // DB가 정한 순서이므로, 이후 로직이 기대하는 body.items 순서로 다시 맞춘다.
    const cartItemIds = body.items.map(item => item.cartItemId);
    const [foundCartItems] = await connection.query(
      `SELECT id, product_id, quantity, version FROM cart_items
       WHERE user_id = ? AND id IN (${cartItemIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`,
      [userId, ...cartItemIds]
    );
    if (foundCartItems.length !== cartItemIds.length) reject('CART_ITEM_NOT_FOUND');
    const cartItemsById = new Map(foundCartItems.map(row => [row.id, row]));
    const rows = body.items.map(item => cartItemsById.get(item.cartItemId));

    const productIds = [...new Set(rows.map(row => row.product_id))].sort((a, b) => a - b);
    const [foundProducts] = await connection.query(
      `SELECT id, name, brand, thumbnail_url, price, status FROM products
       WHERE id IN (${productIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`,
      productIds
    );
    const products = new Map(foundProducts.map(row => [row.id, row]));
    const changes = [];
    let total = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i], expected = body.items[i], product = products.get(row.product_id);
      let reason;
      if (row.version !== expected.version || row.quantity !== expected.quantity) reason = 'CART_CHANGED';
      else if (!product || product.status !== 'active') reason = 'PRODUCT_UNAVAILABLE';
      else if (!Number.isSafeInteger(product.price) || product.price <= 0 || product.price > 2147483647) reason = 'INVALID_PRODUCT_PRICE';
      else if (product.price !== expected.expectedUnitPrice) reason = 'PRODUCT_PRICE_CHANGED';
      if (reason) changes.push({ cartItemId: row.id, reason });
      else total += product.price * row.quantity;
    }
    if (changes.length) reject(changes[0].reason, { items: changes });
    if (!Number.isSafeInteger(total) || total <= 0) reject('INVALID_PRODUCT_PRICE');
    const groupId = await insertGroup(connection, userId, body, users,
      rows.map(row => ({ product: products.get(row.product_id), quantity: row.quantity })), total);
    const ids = rows.map(row => row.id);
    await connection.query(`DELETE FROM cart_items WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [userId, ...ids]);
    const [groups] = await connection.query('SELECT * FROM order_groups WHERE id = ?', [groupId]);
    return loadDetail(groups[0], connection);
  });
}
module.exports = { get, create, createDirect };
