const pool = require('../pool');

const SANCTION_SELECT = `
  SELECT id, user_id, type, reason, issued_by, ends_at, status, created_at
  FROM user_sanctions`;

const getSanctionById = async (id, runner = pool) => {
  const [rows] = await runner.query(`${SANCTION_SELECT} WHERE id = ?`, [id]);
  return rows.length > 0 ? rows[0] : null;
};

// 이미 경고가 있는 유저에게 또 경고를 주려는 요청을 막기 위한 카운트(이슈 #90 7-2절).
const countWarnings = async (userId, runner = pool) => {
  const [rows] = await runner.query(
    "SELECT COUNT(*) AS total FROM user_sanctions WHERE user_id = ? AND type = 'warning'",
    [userId]
  );
  return Number(rows[0].total);
};

// endsAt은 JS Date 객체를 그대로 저장한다. db/pool.js에 timezone 설정이 없어 mysql2가
// Node 프로세스의 로컬 타임존 기준으로 변환해서 저장하고, 읽어올 때도 동일 기준으로
// 되돌리므로 이 앱 안에서 주고받는 값은 일관된다. 다만 나중에 정지 여부 판단 훅에서
// SQL의 NOW()와 직접 비교하는 코드를 추가할 때는, MySQL 서버 세션 타임존이 Node
// 프로세스 타임존과 다르면 오차가 생길 수 있으니 그때 반드시 확인해야 한다.
const createSanction = async (userId, issuedBy, { type, reason, endsAt }) => {
  if (type !== 'warning') {
    const [result] = await pool.query(
      `INSERT INTO user_sanctions (user_id, type, reason, issued_by, ends_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, reason, issuedBy, endsAt]
    );
    return getSanctionById(result.insertId);
  }

  // 경고는 유저당 1건만 허용된다. "개수 확인 후 등록"을 트랜잭션 없이 하면 두 요청이
  // 거의 동시에 들어왔을 때 둘 다 "경고 없음"으로 확인하고 각자 등록해버릴 수 있다
  // (TOCTOU). 같은 트랜잭션에서 유저 행을 잠그고(FOR UPDATE) 재확인한 뒤 등록해,
  // 동시 요청도 순서대로 처리되게 한다.
  const connection = await pool.getConnection();
  let started = false;
  try {
    await connection.beginTransaction();
    started = true;
    await connection.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (await countWarnings(userId, connection) > 0) {
      const error = new Error('WARNING_LIMIT_EXCEEDED');
      error.sanctionError = 'WARNING_LIMIT_EXCEEDED';
      throw error;
    }
    const [result] = await connection.query(
      `INSERT INTO user_sanctions (user_id, type, reason, issued_by, ends_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, type, reason, issuedBy, endsAt]
    );
    const sanction = await getSanctionById(result.insertId, connection);
    await connection.commit();
    return sanction;
  } catch (error) {
    if (started) {
      try { await connection.rollback(); } catch (rollbackError) {
        console.error('Sanction rollback failed:', { code: rollbackError.code });
      }
    }
    throw error;
  } finally {
    connection.release();
  }
};

// DELETE /api/users/me에서 활성 정지 중인 유저의 탈퇴를 막기 위한 조회(이슈 #90 7-5절).
// 정지의 자연 만료는 status를 바꾸지 않고 조회 시점에 ends_at으로 판단하는데, SQL의
// NOW()는 MySQL 서버 세션 타임존 기준이라 Node 프로세스 타임존과 다르면 오차가 생길 수
// 있다(createSanction 주석 참고). endsAt은 이 프로세스가 로컬 타임존 기준으로 쓰고
// 읽으므로, SQL에서 비교하지 않고 그대로 읽어와 Node 프로세스 시계로 비교한다.
const getActiveSuspension = async (userId, runner = pool) => {
  const [rows] = await runner.query(
    `${SANCTION_SELECT} WHERE user_id = ? AND type = 'suspension' AND status = 'active'`,
    [userId]
  );
  const now = Date.now();
  return rows.find(row => new Date(row.ends_at).getTime() > now) || null;
};

// 특정 유저의 제재 이력 — 최신순.
const getUserSanctions = async (userId, { page, limit }) => {
  const [totals] = await pool.query(
    'SELECT COUNT(*) AS total FROM user_sanctions WHERE user_id = ?', [userId]
  );
  const [rows] = await pool.query(
    `${SANCTION_SELECT} WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [userId, limit, (page - 1) * limit]
  );
  return { rows, totalCount: Number(totals[0].total) };
};

const liftSanction = async (id) => {
  const sanction = await getSanctionById(id);
  if (!sanction) return null;
  // 이미 lifted인 걸 다시 lifted로 UPDATE하면 값이 안 바뀌어 MySQL이 affectedRows를
  // 0으로 보고한다(행을 못 찾은 것과 구분이 안 됨) — 재시도/중복 클릭에도 멱등하게
  // 동작하도록 값이 실제로 바뀔 때만 UPDATE한다(reviewModel.updateReviewStatus와 동일 패턴).
  if (sanction.status !== 'lifted') {
    await pool.query("UPDATE user_sanctions SET status = 'lifted' WHERE id = ?", [id]);
    return getSanctionById(id);
  }
  return sanction;
};

module.exports = {
  getSanctionById,
  countWarnings,
  createSanction,
  getActiveSuspension,
  getUserSanctions,
  liftSanction
};
