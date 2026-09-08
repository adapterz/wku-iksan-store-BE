const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/userModel');
jest.mock('../../../db/models/inquiryModel');
const userModel = require('../../../db/models/userModel');
const inquiryModel = require('../../../db/models/inquiryModel');
const adminInquiriesRouter = require('../../../routes/admin/inquiries');

const ADMIN_SESSION = { userId: 1 };

function mockAdminSession() {
  userModel.getUserById.mockResolvedValue({ id: 1, role: 'admin' });
}

const inquiryRow = {
  id: 5, user_id: 2, category: 'sanction_appeal', content: '이의제기합니다',
  admin_reply: null, status: 'pending', created_at: '2026-09-08T00:00:00Z'
};

beforeEach(() => jest.resetAllMocks());
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
    inquiryModel.answerInquiry.mockResolvedValue({
      ...inquiryRow, admin_reply: '정지를 해제했습니다', status: 'answered'
    });
    const app = createTestApp('/api/admin/inquiries', adminInquiriesRouter, { session: ADMIN_SESSION });

    const res = await request(app).patch('/api/admin/inquiries/5').send({ adminReply: ' 정지를 해제했습니다 ' });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('ADMIN_INQUIRY_UPDATE_SUCCESS');
    expect(inquiryModel.answerInquiry).toHaveBeenCalledWith(5, '정지를 해제했습니다');
    expect(res.body.data).toEqual({
      inquiryId: 5, userId: 2, category: 'sanction_appeal', content: '이의제기합니다',
      adminReply: '정지를 해제했습니다', status: 'answered', createdAt: inquiryRow.created_at
    });
  });
});
