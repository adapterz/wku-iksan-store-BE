// Explicit localhost credentials only. Creates/drops one random DB; never uses supplied DB_NAME.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const request = require('supertest');
const express = require('express');
require('./helpers/isolate-product-cache');
const config = process.argv[2] ? require('dotenv').parse(fs.readFileSync(process.argv[2])) : process.env;
assert(['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST), 'Local MySQL only');
const database = 'cart_test_' + crypto.randomBytes(8).toString('hex');
let admin, pool, created = false, checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const root = path.resolve(__dirname, '..');
async function runSql(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const sql of source.replace(/^--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean)) await admin.query(sql);
}
async function main() {
  admin = await mysql.createConnection({ host: config.DB_HOST, port: config.DB_PORT || 3306, user: config.DB_USER, password: config.DB_PASSWORD });
  await admin.query('CREATE DATABASE ' + database + ' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci'); created = true;
  await admin.query('USE ' + database);
  await runSql('db/schema.sql');
  for (let i = 1; i <= 12; i++) await admin.query('INSERT INTO users(id,email,password,nickname) VALUES(?,?,?,?)', [i, `cart${i}@example.test`, 'fixture', 'fixture-' + i]);
  await admin.query("INSERT INTO categories(id,name) VALUES(1,'fixture')");
  for (let i = 1; i <= 40; i++) await admin.query('INSERT INTO products(id,name,brand,price,category_id) VALUES(?,?,?,?,1)', [i, 'product-' + i, 'brand', i * 1000]);
  await admin.query("INSERT INTO orders(id,user_id,sender_nickname_snapshot,product_id,receiver_id,receiver_nickname_snapshot,total_price,is_self_gift,payment_status) VALUES(1,1,'legacy',1,2,'legacy',1000,false,'paid')");
  await admin.query("INSERT INTO gifts(id,order_id,barcode,status) VALUES(1,1,'000000000001','unused')");
  const [fresh] = await admin.query('SHOW COLUMNS FROM orders');
  // Recreate pre-feature schema then apply exact migrations while preserving a legacy order/gift.
  await admin.query('ALTER TABLE orders DROP FOREIGN KEY fk_orders_group, DROP INDEX idx_orders_group, DROP COLUMN order_group_id, DROP COLUMN product_name_snapshot, DROP COLUMN brand_snapshot, DROP COLUMN thumbnail_url_snapshot');
  await admin.query('DROP TABLE order_groups'); await admin.query('DROP TABLE cart_items');
  await admin.query('ALTER TABLE gifts DROP INDEX uq_gifts_barcode');
  await runSql('db/migrate_cart_items.sql'); await runSql('db/migrate_order_groups.sql'); await runSql('db/migrate_gift_barcode_unique.sql');
  const [migrated] = await admin.query('SHOW COLUMNS FROM orders');
  for (const name of ['order_group_id','product_name_snapshot','brand_snapshot','thumbnail_url_snapshot']) {
    assert.deepEqual(migrated.find(c => c.Field === name), fresh.find(c => c.Field === name)); checks++;
  }
  const [[legacy]] = await admin.query('SELECT o.order_group_id, o.product_name_snapshot, g.barcode FROM orders o JOIN gifts g ON g.order_id=o.id WHERE o.id=1');
  check(legacy.order_group_id === null && legacy.product_name_snapshot === null && legacy.barcode === '000000000001', 'migration preserves legacy');
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD']) if (config[key] !== undefined) process.env[key] = config[key];
  process.env.DB_NAME = database; process.env.NODE_ENV = 'test';
  pool = require('../db/pool');
  const app = express(); app.use(express.json());
  // Test-only session fixture, not a route or header accepted by the production app.
  app.use((req, res, next) => { req.session = { userId: Number(req.get('X-Fixture-User')) || undefined }; next(); });
  app.use('/api/cart-items', require('../routes/cartItems'));
  app.use('/api/order-groups', require('../routes/orderGroups'));
  for (const route of ['orders', 'gifts', 'products', 'reviews']) app.use('/api/' + route, require('../routes/' + route));
  const http = (user, method, url, body, key) => {
    let call = request(app)[method](url).set('X-Fixture-User', String(user));
    if (key) call = call.set('Idempotency-Key', key);
    return body ? call.send(body) : call;
  };
  const list = async user => (await http(user,'get','/api/cart-items')).body.data;
  const add = (user, productId, quantity=1) => http(user,'post','/api/cart-items',{ productId, quantity });
  const checkout = (user, body, key) => http(user,'post','/api/order-groups',body,key);
  const payload = items => ({ items: items.map(i => ({ cartItemId:i.cartItemId, quantity:i.quantity, version:i.version, expectedUnitPrice:i.unitPrice })), isSelfGift:false, receiverId:2, message:'함께 선물' });
  check((await http(0,'get','/api/cart-items')).status===401, 'auth');
  const added = await add(1,1); check(added.status===201,'add');
  const same = await add(1,1); check(same.body.data.quantity===2 && same.body.data.version===2,'aggregate');
  await add(1,2); await add(1,3);
  const cart = await list(1); const body = payload(cart.slice(0,2));
  const key='same-request-123456789';
  const simultaneous = await Promise.all(Array.from({length:5},()=>checkout(1,body,key)));
  check(simultaneous.every(r=>r.status===201),'same key concurrent success');
  check(new Set(simultaneous.map(r=>r.body.data.orderGroupId)).size===1,'one group only');
  const group = simultaneous[0].body.data;
  check(group.totalQuantity===3 && group.totalPrice===4000 && group.items[0].quantity===2,'2 coffees + 1 bread');
  check((await list(1)).length===1 && (await list(1))[0].productId===3,'unselected retained');
  assert.deepEqual((await checkout(1,body,key)).body.data, group); checks++;
  check((await checkout(1,{...body,message:'different'},key)).body.code==='IDEMPOTENCY_KEY_REUSED','key conflict');
  check((await http(3,'get','/api/order-groups/'+group.orderGroupId)).status===404,'owner privacy');
  const serialized=JSON.stringify(group); check(!serialized.includes('barcode')&&!serialized.includes('request_hash')&&!serialized.includes(key),'no private fields');
  const [codes]=await admin.query('SELECT barcode FROM gifts WHERE order_id IN (SELECT id FROM orders WHERE order_group_id=?)',[group.orderGroupId]);
  check(codes.length===3 && new Set(codes.map(r=>r.barcode)).size===3 && codes.every(r=>/^\d{12}$/.test(r.barcode)),'unique barcodes');
  const units=group.items.flatMap(i=>i.units);
  for(const unit of units.slice(0,2)) {
    check((await http(2,'patch',`/api/gifts/${unit.giftId}/use`)).status===200,'independent use');
    check((await http(2,'post','/api/reviews',{giftId:unit.giftId,rating:5,content:'후기'})).status===201,'review per unit');
  }
  const [[unused]]=await admin.query('SELECT status FROM gifts WHERE id=?',[units[2].giftId]); check(unused.status==='unused','third stays unused');
  await admin.query("UPDATE products SET name='changed',price=9000,status='hidden' WHERE id=1");
  assert.deepEqual((await http(1,'get','/api/order-groups/'+group.orderGroupId)).body.data,group); checks++;
  const oldSingle=await http(1,'get','/api/orders/'+units[0].orderId); check(oldSingle.body.data.product.name==='product-1','single detail snapshot');
  const giftDetail=await http(2,'get','/api/gifts/'+units[0].giftId);
  check(giftDetail.status===200 && giftDetail.body.data.productName==='product-1','recipient sees same product snapshot');
  const giftList=await http(2,'get','/api/gifts');
  check(giftList.body.data.find(g=>g.giftId===units[0].giftId).productName==='product-1','recipient list snapshot');
  check((await add(1,1)).status===409,'hidden add refused');
  await admin.query("UPDATE products SET name='product-1',price=1000,status='active' WHERE id=1");
  const remaining=(await list(1))[0];
  check((await http(3,'post','/api/cart-items/remove',{itemIds:[remaining.cartItemId]})).status===404,'foreign remove refused');
  check((await http(1,'post','/api/cart-items/remove',{itemIds:[remaining.cartItemId,99999]})).status===404,'mixed missing atomic');
  check((await list(1)).length===1,'failed remove unchanged');
  const edits=await Promise.all([1,2].map(quantity=>http(1,'patch','/api/cart-items/'+remaining.cartItemId,{quantity,version:remaining.version})));
  assert.deepEqual(edits.map(r=>r.status).sort(),[200,409]); checks++;
  const current=await list(1); const stale=payload(current);
  await admin.query('UPDATE products SET price=price+1 WHERE id=3');
  check((await checkout(1,stale,'price-change-123456')).body.code==='PRODUCT_PRICE_CHANGED','price guard');
  await admin.query("UPDATE products SET status='discontinued' WHERE id=3");
  check((await list(1))[0].canOrder===false,'unavailable retained');
  check((await checkout(1,stale,'status-change-123456')).body.code==='PRODUCT_UNAVAILABLE','status guard');
  await admin.query("UPDATE products SET status='active' WHERE id=3");
  check((await checkout(1,{...payload(await list(1)),receiverId:99999},'receiver-test-12345')).status===404,'missing receiver');
  const races=await Promise.all(['different-key-123456','different-key-234567'].map(k=>checkout(1,payload(current),k)));
  check(races.every(r=>r.status===409),'changed price still no orders');
  const freshBody=payload(await list(1));
  const distinct=await Promise.all(['different-key-345678','different-key-456789'].map(k=>checkout(1,freshBody,k)));
  assert.deepEqual(distinct.map(r=>r.status).sort(),[201,404]);checks++;

  // Real constraint failures and atomic rollback on later gift insertion.
  await add(4,1); await add(4,2); const failingBody=payload(await list(4));
  await admin.query("CREATE TRIGGER fail_cart_gift BEFORE INSERT ON gifts FOR EACH ROW BEGIN IF (SELECT product_id FROM orders WHERE id=NEW.order_id)=2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture'; END IF; END");
  const fail=await checkout(4,failingBody,'rollback-test-12345');check(fail.status===500,'mid batch failure');
  const [[rolled]]=await admin.query('SELECT COUNT(*) AS n FROM order_groups WHERE user_id=4');check(rolled.n===0&&(await list(4)).length===2,'group/order/gift/cart rolled back');
  await admin.query('DROP TRIGGER fail_cart_gift');
  check((await checkout(4,failingBody,'rollback-test-12345')).status===201,'retry after rollback');

  // Same user limits under concurrent additions.
  const species=await Promise.all(Array.from({length:40},(_,i)=>add(6,i+1)));
  check(species.filter(r=>r.status===201).length===30 && (await list(6)).length===30,'30 species concurrent limit');
  check(species.filter(r=>r.body.code==='CART_LIMIT_EXCEEDED').length===10,'limit reasons');
  const amounts=await Promise.all(Array.from({length:14},()=>add(7,1)));
  check(amounts.filter(r=>r.status===201).length===10 && (await list(7))[0].quantity===10,'10 unit concurrent limit');
  const version=(await list(7))[0];
  await assert.rejects(admin.query('UPDATE cart_items SET quantity=0 WHERE id=?',[version.cartItemId]),e=>e.code==='ER_CHECK_CONSTRAINT_VIOLATED'); checks++;
  // 50 allowed / 60 blocked, self gift and distinct unit IDs.
  for(let i=1;i<=6;i++)await add(8,i,10);
  const large=payload(await list(8)); large.isSelfGift=true;delete large.receiverId;
  check((await checkout(8,large,'large-block-123456')).body.code==='ORDER_QUANTITY_EXCEEDED','60 refused');
  const fifty=await checkout(8,{...large,items:large.items.slice(0,5)},'large-allow-123456');
  check(fifty.status===201 && fifty.body.data.totalQuantity===50,'50 self units');
  check((await list(8)).length===1,'sixth remains');
  // Two senders gifting each other: lock order must not deadlock indefinitely.
  await add(9,1);await add(10,1);
  const pair=await Promise.all([checkout(9,{...payload(await list(9)),receiverId:10},'cross-gift-123456'),checkout(10,{...payload(await list(10)),receiverId:9},'cross-gift-123456')]);
  check(pair.every(r=>r.status===201),'cross user concurrency');
  // Numeric barcode collision uses bounded retry and keeps the entire order atomic.
  const originalRandom=crypto.randomInt;
  try {
    let calls=0; crypto.randomInt=()=>++calls===1?1:999999999999;
    const collision=await http(11,'post','/api/orders',{productId:1,isSelfGift:true});
    check(collision.status===201 && calls===2,'single gift collision retry');
    crypto.randomInt=()=>1;
    const repeated=await http(11,'post','/api/orders',{productId:1,isSelfGift:true});
    check(repeated.status===500,'collision exhaustion fails safely');
    const [[singleCount]]=await admin.query('SELECT COUNT(*) AS n FROM orders WHERE user_id=11');check(singleCount.n===1,'no orphan on collision');
  } finally {crypto.randomInt=originalRandom;}
  // Deleting accounts preserves the order group and snapshots, removes cart only.
  await add(1,4);
  await admin.query('DELETE FROM users WHERE id=2');
  const detached=(await http(1,'get','/api/order-groups/'+group.orderGroupId)).body.data;
  check(detached.receiver.userId===null && detached.receiver.nickname==='fixture-2','receiver snapshot survives');
  check((await checkout(1,body,key)).status===201,'replay after receiver deletion');
  await admin.query('DELETE FROM users WHERE id=1');
  const [[preserved]]=await admin.query('SELECT user_id,sender_nickname_snapshot FROM order_groups WHERE id=?',[group.orderGroupId]);
  const [[empty]]=await admin.query('SELECT COUNT(*) AS n FROM cart_items WHERE user_id=1');
  check(preserved.user_id===null&&preserved.sender_nickname_snapshot==='fixture-1'&&empty.n===0,'sender deletion retains history');
  console.log(JSON.stringify({ result:'PASS', checks, database }));
}
main().catch(error=>{console.error('Cart DB test failed:',error);process.exitCode=1;}).finally(async()=>{
  if(pool)await pool.end();
  if(created&&/^cart_test_[a-f0-9]{16}$/.test(database)){await admin.query('DROP DATABASE '+database);console.log('Temporary cart database removed');}
  if(admin)await admin.end();
});
