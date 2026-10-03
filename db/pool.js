const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  // DATETIME은 KST로 저장한다. Node/Docker의 TZ와 무관하게 읽기·쓰기 기준을 고정한다.
  // MySQL 세션 time_zone을 바꾸는 옵션은 아니다. 전환 전 기존 ends_at 점검은
  // docs/BE/DATABASE_TIMEZONE.md 참고.
  timezone: '+09:00',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
