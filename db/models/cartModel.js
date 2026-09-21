const pool = require('../pool');
const { MAX_ITEMS, MAX_QUANTITY } = require('../../constants/cart');
const { reject } = require('../../validators/cartValidator');
const { transaction, lockUsers } = require('./cartTransaction');
const fields = `SELECT c.id, c.product_id, c.quantity, c.version, p.name, p.brand,
  p.thumbnail_url, p.price, p.status FROM cart_items c JOIN products p ON p.id = c.product_id`;
function mapItem(row) {
  const validPrice = Number.isSafeInteger(row.price) && row.price > 0 && row.price <= 2147483647;
  return { cartItemId: row.id, productId: row.product_id, name: row.name, brand: row.brand,
    thumbnailUrl: row.thumbnail_url, quantity: row.quantity, version: row.version,
    unitPrice: row.price, subtotal: validPrice ? row.price * row.quantity : null,
    productStatus: row.status, canOrder: row.status === 'active' && validPrice,
    unavailableReason: row.status !== 'active' ? 'PRODUCT_UNAVAILABLE' : validPrice ? null : 'INVALID_PRODUCT_PRICE' };
}
async function list(userId, runner = pool) {
  const [rows] = await runner.query(fields + ' WHERE c.user_id = ? ORDER BY c.id ASC', [userId]);
  return rows.map(mapItem);
}
async function add(userId, { productId, quantity }) {
  return transaction(async connection => {
    await lockUsers(connection, userId);
    const [rows] = await connection.query('SELECT id, quantity, version FROM cart_items WHERE user_id = ? AND product_id = ? FOR UPDATE', [userId, productId]);
    const [products] = await connection.query('SELECT id, status FROM products WHERE id = ? FOR UPDATE', [productId]);
    if (!products.length) reject('PRODUCT_NOT_FOUND');
    if (products[0].status !== 'active') reject('PRODUCT_UNAVAILABLE');
    if (rows.length) {
      if (rows[0].quantity + quantity > MAX_QUANTITY) reject('CART_QUANTITY_EXCEEDED');
      if (rows[0].version >= 2147483647) reject('CART_CHANGED');
      await connection.query('UPDATE cart_items SET quantity = quantity + ?, version = version + 1 WHERE id = ?', [quantity, rows[0].id]);
    } else {
      const [[{ total }]] = await connection.query('SELECT COUNT(*) AS total FROM cart_items WHERE user_id = ?', [userId]);
      if (Number(total) >= MAX_ITEMS) reject('CART_LIMIT_EXCEEDED');
      await connection.query('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)', [userId, productId, quantity]);
    }
    return (await list(userId, connection)).find(item => item.productId === productId);
  });
}
async function update(userId, id, { quantity, version }) {
  return transaction(async connection => {
    await lockUsers(connection, userId);
    const [rows] = await connection.query('SELECT version FROM cart_items WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
    if (!rows.length) reject('CART_ITEM_NOT_FOUND');
    if (rows[0].version !== version || version >= 2147483647) reject('CART_CHANGED', { items: [{ cartItemId: id, reason: 'CART_CHANGED' }] });
    await connection.query('UPDATE cart_items SET quantity = ?, version = version + 1 WHERE id = ?', [quantity, id]);
    return (await list(userId, connection)).find(item => item.cartItemId === id);
  });
}
async function remove(userId, ids) {
  return transaction(async connection => {
    await lockUsers(connection, userId);
    const marks = ids.map(() => '?').join(',');
    const [rows] = await connection.query(`SELECT id FROM cart_items WHERE user_id = ? AND id IN (${marks}) ORDER BY id FOR UPDATE`, [userId, ...ids]);
    if (rows.length !== ids.length) reject('CART_ITEM_NOT_FOUND');
    await connection.query(`DELETE FROM cart_items WHERE user_id = ? AND id IN (${marks})`, [userId, ...ids]);
    return { itemIds: ids };
  });
}
module.exports = { list, add, update, remove };
