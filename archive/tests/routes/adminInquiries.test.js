const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/pool', () => ({ getConnection: jest.fn(), query: jest.fn() }));
jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/inquiryModel');
jest.mock('../../../db/models/sanctionModel');
const pool = require('../../../db/pool');
const userModel = require('../../../db/models/userModel');
const inquiryModel = require('../../../db/models/inquiryModel');
const sanctionModel = require('../../../db/models/sanctionModel');
const adminInquiriesRouter = require('../../../routes/admin/inquiries');

const ADMIN_SESSION = { userId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

const inquiryRow = {
  id: 5, user_id: 2, category: 'sanction_appeal', content: '이의제기합니다',
  admin_reply: null, resolved_sanction_id: null, status: 'pending', created_at: '2026-09-08T00:00:00Z'
};

let connection;

beforeEach(() => {
  jest.resetAllMocks();
  connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
  pool.getConnection.mockResolvedValue(connection);
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/admin/inquiries', () => {
  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/inquiries');

    expect(res.status).toBe(403);
    expect(inquiryModel.getInquiries).not.toHaveBeenCalled();
  });

  test('잘못된 status 필터는 400 INVALID_INQUIRY_STATUS', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/inquiries?status=unknown');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INQUIRY_STATUS');
  });

  test('정상 조회 시 200과 페이지 meta', async () => {
    mockAdminSession();
    inquiryModel.getInquiries.mockResolvedValue({ rows: [inquiryRow], totalCount: 1 });
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/inquiries?status=pending');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_INQUIRY_LIST_SUCCESS');
    expect(inquiryModel.getInquiries).toHaveBeenCalledWith({ status: 'pending', page: 1, limit: 10 });
    expect(res.body.data[0]).toEqual({
      inquiryId: 5, userId: 2, category: 'sanction_appeal', content: '이의제기합니다',
      adminReply: null, resolvedSanctionId: null, status: 'pending', createdAt: inquiryRow.created_at
    });
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalCount: 1, totalPages: 1 });
  });

  test('page/limit 쿼리를 지정하면 그대로 모델에 전달', async () => {
    mockAdminSession();
    inquiryModel.getInquiries.mockResolvedValue({ rows: [], totalCount: 25 });
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).get('/api/admin/inquiries?page=2&limit=20');

    expect(res.status).toBe(200);
    expect(inquiryModel.getInquiries).toHaveBeenCalledWith({ status: null, page: 2, limit: 20 });
    expect(res.body.meta).toEqual({ page: 2, limit: 20, totalCount: 25, totalPages: 2 });
  });
});

describe('PATCH /api/admin/inquiries/:id', () => {
  test('관리자가 아니면 403 FORBIDDEN_NOT_ADMIN', async () => {
    userModel.getUserById.mockResolvedValue({ id: 1, role: 'user' });
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변' });

    expect(res.status).toBe(403);
    expect(inquiryModel.getInquiryById).not.toHaveBeenCalled();
  });

  test('id가 유효하지 않으면 400 INVALID_INQUIRY_ID', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/abc').send({ adminReply: '답변' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INQUIRY_ID');
  });

  test('adminReply가 없으면 400 REQUIRED_ADMIN_REPLY', async () => {
    mockAdminSession();
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_ADMIN_REPLY');
    expect(inquiryModel.getInquiryById).not.toHaveBeenCalled();
  });

  test('문의가 없으면 404 INQUIRY_NOT_FOUND', async () => {
    mockAdminSession();
    inquiryModel.getInquiryById.mockResolvedValue(null);
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/999').send({ adminReply: '답변' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INQUIRY_NOT_FOUND');
    expect(inquiryModel.answerInquiry).not.toHaveBeenCalled();
  });

  test('정상 답변 등록 시 200과 answered 상태', async () => {
    mockAdminSession();
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.answerInquiry.mockResolvedValue({
      ...inquiryRow, admin_reply: '정지를 해제했습니다', status: 'answered'
    });
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: ' 정지를 해제했습니다 ' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_INQUIRY_UPDATE_SUCCESS');
    // sanctionId가 없어도 동시 처리 방지를 위해 항상 락을 걸고 트랜잭션으로 처리한다.
    expect(inquiryModel.lockInquiryById).toHaveBeenCalledWith(5, connection);
    // sanctionId를 생략하면 resolvedSanctionId는 null로 저장된다.
    expect(inquiryModel.answerInquiry).toHaveBeenCalledWith(5, '정지를 해제했습니다', null, connection);
    expect(res.body.data).toEqual({
      inquiryId: 5, userId: 2, category: 'sanction_appeal', content: '이의제기합니다',
      adminReply: '정지를 해제했습니다', resolvedSanctionId: null, status: 'answered', createdAt: inquiryRow.created_at
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('이미 다른 관리자가 다른 내용으로 답변한 뒤 재요청하면 409 INQUIRY_ALREADY_PROCESSED', async () => {
    mockAdminSession();
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue({
      ...inquiryRow, admin_reply: '이미 승인 처리했습니다', status: 'answered'
    });
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '반려합니다' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INQUIRY_ALREADY_PROCESSED');
    expect(inquiryModel.answerInquiry).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('이미 같은 내용으로 답변된 뒤 재시도하면(멱등) 200으로 그대로 반환, 재처리는 실행 안 함', async () => {
    mockAdminSession();
    const answered = { ...inquiryRow, admin_reply: '정지를 해제했습니다', resolved_sanction_id: null, status: 'answered' };
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue(answered);
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '정지를 해제했습니다' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_INQUIRY_UPDATE_SUCCESS');
    expect(res.body.data.adminReply).toBe('정지를 해제했습니다');
    // 완전히 같은 처리의 재시도이므로 정지 조회/해제·문의 UPDATE를 다시 실행하지 않는다.
    expect(sanctionModel.getSanctionById).not.toHaveBeenCalled();
    expect(sanctionModel.liftSanction).not.toHaveBeenCalled();
    expect(inquiryModel.answerInquiry).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('같은 답변 문구여도 sanctionId가 다르면 409 INQUIRY_ALREADY_PROCESSED (다른 정지가 잘못 해제되는 것을 막음)', async () => {
    mockAdminSession();
    const answeredWithSanctionA = {
      ...inquiryRow, admin_reply: '확인 후 해제했습니다', resolved_sanction_id: 42, status: 'answered'
    };
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue(answeredWithSanctionA);
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    // 문구는 정지 A를 해제했을 때와 완전히 동일하지만, 이번엔 다른 정지(99)를 지정했다.
    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '확인 후 해제했습니다', sanctionId: 99 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INQUIRY_ALREADY_PROCESSED');
    // sanctionId 99는 조회조차 되지 않아야 한다 — 잘못된 정지가 추가로 해제되면 안 된다.
    expect(sanctionModel.getSanctionById).not.toHaveBeenCalled();
    expect(sanctionModel.liftSanction).not.toHaveBeenCalled();
    expect(inquiryModel.answerInquiry).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('같은 sanctionId를 지정해도 답변 문구가 다르면 409 INQUIRY_ALREADY_PROCESSED (처리 결과 변경은 별도 절차로)', async () => {
    mockAdminSession();
    const answeredWithSanctionA = {
      ...inquiryRow, admin_reply: '확인 후 해제했습니다', resolved_sanction_id: 42, status: 'answered'
    };
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue(answeredWithSanctionA);
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    // 같은 정지(42)를 가리키지만 답변 문구를 바꿔서 다시 보냄 — 사후 정정은 재시도가 아니라
    // 별도의 명시적인 변경 절차로 다뤄야 하므로 통과시키지 않는다.
    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '문구를 정정합니다', sanctionId: 42 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INQUIRY_ALREADY_PROCESSED');
    expect(sanctionModel.getSanctionById).not.toHaveBeenCalled();
    expect(inquiryModel.answerInquiry).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('sanctionId 없이 처리된 문의에 나중에 sanctionId를 붙여 재요청하면 409 INQUIRY_ALREADY_PROCESSED', async () => {
    mockAdminSession();
    const answeredWithoutSanction = {
      ...inquiryRow, admin_reply: '반려합니다', resolved_sanction_id: null, status: 'answered'
    };
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue(answeredWithoutSanction);
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '반려합니다', sanctionId: 42 });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INQUIRY_ALREADY_PROCESSED');
    expect(sanctionModel.liftSanction).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  describe('sanctionId를 함께 보내 정지 해제와 묶는 경우', () => {
    test('sanctionId를 형식에 안 맞게 보내면 400 INVALID_SANCTION_ID', async () => {
      mockAdminSession();
      const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

      const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변', sanctionId: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_SANCTION_ID');
      expect(inquiryModel.getInquiryById).not.toHaveBeenCalled();
    });

    test('sanction_appeal이 아닌 문의에 sanctionId를 보내면 400 SANCTION_ID_NOT_ALLOWED', async () => {
      mockAdminSession();
      inquiryModel.getInquiryById.mockResolvedValue({ ...inquiryRow, category: 'general' });
      const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

      const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변', sanctionId: 42 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SANCTION_ID_NOT_ALLOWED');
      expect(pool.getConnection).not.toHaveBeenCalled();
    });

    test('정상 승인 시 같은 트랜잭션에서 정지 해제 후 답변 저장', async () => {
      mockAdminSession();
      inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
      inquiryModel.lockInquiryById.mockResolvedValue(inquiryRow);
      sanctionModel.getSanctionById.mockResolvedValue({ id: 42, user_id: 2, type: 'suspension', status: 'active' });
      sanctionModel.liftSanction.mockResolvedValue({ id: 42, status: 'lifted' });
      inquiryModel.answerInquiry.mockResolvedValue({
        ...inquiryRow, admin_reply: '정지를 해제했습니다', status: 'answered'
      });
      const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

      const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '정지를 해제했습니다', sanctionId: 42 });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('ADMIN_INQUIRY_UPDATE_SUCCESS');
      expect(sanctionModel.getSanctionById).toHaveBeenCalledWith(42, connection);
      expect(sanctionModel.liftSanction).toHaveBeenCalledWith(42, connection);
      expect(inquiryModel.answerInquiry).toHaveBeenCalledWith(5, '정지를 해제했습니다', 42, connection);
      expect(connection.commit).toHaveBeenCalledTimes(1);
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.release).toHaveBeenCalledTimes(1);
    });

    test('sanctionId가 존재하지 않으면 404 SANCTION_NOT_FOUND, rollback', async () => {
      mockAdminSession();
      inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
      inquiryModel.lockInquiryById.mockResolvedValue(inquiryRow);
      sanctionModel.getSanctionById.mockResolvedValue(null);
      const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

      const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변', sanctionId: 999 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SANCTION_NOT_FOUND');
      expect(sanctionModel.liftSanction).not.toHaveBeenCalled();
      expect(inquiryModel.answerInquiry).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
    });

    test('sanctionId가 다른 유저 것이면 404 SANCTION_NOT_FOUND(존재 여부를 알려주지 않음)', async () => {
      mockAdminSession();
      inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
      inquiryModel.lockInquiryById.mockResolvedValue(inquiryRow);
      sanctionModel.getSanctionById.mockResolvedValue({ id: 42, user_id: 999, status: 'active' });
      const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

      const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변', sanctionId: 42 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('SANCTION_NOT_FOUND');
      expect(sanctionModel.liftSanction).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
    });

    test('sanctionId가 warning이면 400 SANCTION_NOT_SUSPENSION, rollback (해제해도 경고 제한에는 계속 걸림)', async () => {
      mockAdminSession();
      inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
      inquiryModel.lockInquiryById.mockResolvedValue(inquiryRow);
      sanctionModel.getSanctionById.mockResolvedValue({ id: 42, user_id: 2, type: 'warning', status: 'active' });
      const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

      const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변', sanctionId: 42 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('SANCTION_NOT_SUSPENSION');
      expect(sanctionModel.liftSanction).not.toHaveBeenCalled();
      expect(inquiryModel.answerInquiry).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
    });

    test('조회~잠금 사이 문의가 사라지면(레이스) 정지 해제를 시도하지 않고 404 INQUIRY_NOT_FOUND로 롤백', async () => {
      mockAdminSession();
      inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
      inquiryModel.lockInquiryById.mockResolvedValue(null);
      const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

      const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변', sanctionId: 42 });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('INQUIRY_NOT_FOUND');
      // 락 시점에 이미 사라진 게 확인되므로 정지 해제 자체를 시도하지 않는다.
      expect(sanctionModel.getSanctionById).not.toHaveBeenCalled();
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.commit).not.toHaveBeenCalled();
    });
  });

  test('sanctionId 없이 답변할 때도 조회~잠금 사이 문의가 사라지면 404 INQUIRY_NOT_FOUND(500 아님)', async () => {
    mockAdminSession();
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue(null);
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '답변' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('INQUIRY_NOT_FOUND');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });
});
