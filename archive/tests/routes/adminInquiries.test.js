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
  admin_reply: null, status: 'pending', created_at: '2026-09-08T00:00:00Z'
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
      adminReply: null, status: 'pending', createdAt: inquiryRow.created_at
    });
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalCount: 1, totalPages: 1 });
  });
});

describe('PATCH /api/admin/inquiries/:id', () => {
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
    expect(inquiryModel.answerInquiry).toHaveBeenCalledWith(5, '정지를 해제했습니다', connection);
    expect(res.body.data).toEqual({
      inquiryId: 5, userId: 2, category: 'sanction_appeal', content: '이의제기합니다',
      adminReply: '정지를 해제했습니다', status: 'answered', createdAt: inquiryRow.created_at
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

  test('이미 같은 내용으로 답변된 뒤 재시도하면(멱등) 200으로 그대로 반환', async () => {
    mockAdminSession();
    const answered = { ...inquiryRow, admin_reply: '정지를 해제했습니다', status: 'answered' };
    inquiryModel.getInquiryById.mockResolvedValue(inquiryRow);
    inquiryModel.lockInquiryById.mockResolvedValue(answered);
    inquiryModel.answerInquiry.mockResolvedValue(answered);
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: '정지를 해제했습니다' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_INQUIRY_UPDATE_SUCCESS');
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
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
      expect(inquiryModel.answerInquiry).toHaveBeenCalledWith(5, '정지를 해제했습니다', connection);
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
