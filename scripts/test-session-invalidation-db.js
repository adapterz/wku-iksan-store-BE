// Local-only integration: creates/drops a random disposable DB; ignores supplied DB_NAME.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
require('./helpers/isolate-product-cache');
const cfg = process.argv[2] ? require('dotenv').parse(fs.readFileSync(process.argv[2])) : process.env;
assert(['localhost','127.0.0.1','::1'].includes(cfg.DB_HOST), 'Explicit localhost DB_HOST required');
const database = 'session_invalidation_test_' + crypto.randomBytes(8).toString('hex');
let admin, pool, store, created = false, checks = 0;
const check = (condition, label) => { assert.ok(condition,label); checks++; };
async function main() {
  admin = await mysql.createConnection({host:cfg.DB_HOST,port:cfg.DB_PORT||3306,user:cfg.DB_USER,password:cfg.DB_PASSWORD});
  await admin.query('CREATE DATABASE '+database+' CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci'); created=true;
  await admin.query('USE '+database);
  // 직전 회원 스키마의 legacy 행을 만든 뒤 실제 마이그레이션 파일을 검증한다.
  const schema = fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8');
  const userSchema = schema.slice(0,schema.indexOf(';')+1).replace(/^\s*auth_version.*\r?\n/m,'');
  await admin.query(userSchema);
  const old = 'OldPassword123!', fresh = 'NewPassword456!';
  const hash = await bcrypt.hash(old,4);
  await admin.query("INSERT INTO users(id,email,password,nickname,role) VALUES(1,'one@example.test',?,'userone','admin'),(2,'two@example.test',?,'usertwo','user')",[hash,hash]);
  const migration = fs.readFileSync(path.join(__dirname,'../db/migrate_user_auth_version.sql'),'utf8');
  for (const sql of migration.replace(/^--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean)) await admin.query(sql);
  const [[legacy]] = await admin.query('SELECT password,auth_version FROM users WHERE id=1');
  check(legacy.password===hash && legacy.auth_version===1,'legacy password preserved + default version');
  await admin.query("INSERT INTO users(email,password,nickname) VALUES('new@example.test',?,'newuser')",[hash]);
  const [[newUser]] = await admin.query("SELECT auth_version FROM users WHERE email='new@example.test'");
  check(newUser.auth_version===1,'new user default');
  for(const key of ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD'])if(cfg[key]!==undefined)process.env[key]=cfg[key];
  process.env.DB_NAME=database; process.env.NODE_ENV='test';
  pool=require('../db/pool');
  store=new session.MemoryStore();
  const app=express(); app.use(express.json());
  app.use(session({secret:crypto.randomBytes(32).toString('hex'),resave:false,saveUninitialized:false,store}));
  app.use('/api/auth',require('../routes/auth')); app.use('/api/users',require('../routes/users'));
  const mobile=request.agent(app), pc=request.agent(app), other=request.agent(app);
  const login=(agent,email,password)=>agent.post('/api/auth/login').send({email,password});
  check((await login(mobile,'one@example.test',old)).status===200,'mobile login');
  check((await login(pc,'one@example.test',old)).status===200,'pc login');
  await login(other,'two@example.test',old);
  const changed=await mobile.patch('/api/users/me/password').send({currentPassword:old,newPassword:fresh});
  check(changed.status===200,'password success');
  check(changed.headers['set-cookie'][0].includes('connect.sid=;'),'current cookie cleared');
  check((await mobile.get('/api/auth/me')).status===401,'current blocked');
  check((await pc.get('/api/auth/me')).status===401,'other device blocked');
  check((await other.get('/api/auth/me')).status===200,'other user unaffected');
  check((await login(pc,'one@example.test',old)).status===401,'old password blocked');
  check((await login(pc,'one@example.test',fresh)).status===200,'new password succeeds');
  check((await pc.post('/api/auth/logout')).status===200,'logout');
  check((await pc.post('/api/auth/logout')).status===200,'repeat logout');
  const model=require('../db/models/userModel');
  const outcomes=await Promise.all([model.updateUserPassword(1,'first',2),model.updateUserPassword(1,'second',2)]);
  check(outcomes.filter(Boolean).length===1,'real concurrent SQL only one update');
  const [[row]]=await admin.query('SELECT password,auth_version FROM users WHERE id=1');
  check(row.auth_version===3 && ['first','second'].includes(row.password),'atomic version/password');
  await assert.rejects(model.updateUserPassword(1,'overflow',4294967295)); checks++;
  console.log(`Session invalidation DB checks passed: ${checks}`);
}
main().catch(error=>{console.error('Local DB validation failed:',error.code||error.message);process.exitCode=1;})
  .finally(async()=>{
    if(store)await new Promise(resolve=>store.clear(resolve));
    if(pool)await pool.end();
    if(admin){if(created)await admin.query('DROP DATABASE '+database);await admin.end();}
  });
