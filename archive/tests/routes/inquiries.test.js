const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/inquiryModel');
const inquiryModel = require('../../../db/models/inquiryModel');
const inquiriesRouter = require('../../../routes/inquiries');

const app = (userId = 1) => createTestApp('/api/inquiries', inquiriesRouter, { session: userId ? { userId } : {} });

const inquiryRow = {
  id: 5, user_id: 1, category: 'general', content: '배송이 안 와요',
  admin_reply: null, status: 'pending', created_at: '2026-09-08T00:00:00Z'
};

beforeEach(() => jest.resetAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('POST /api/inquiries', () => {
  test('미인증이면 401', async () => {
    const res = await request(app(null)).post('/api/inquiries').send({ content: '문의' });
    expect(res.status).toBe(401);
    expect(inquiryModel.createInquiry).not.toHaveBeenCalled();
  });

  test('content가 없으면 400 REQUIRED_INQUIRY_CONTENT', async () => {
    const res = await request(app()).post('/api/inquiries').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('REQUIRED_INQUIRY_CONTENT');
    expect(inquiryModel.createInquiry).not.toHaveBeenCalled();
  });

  test('허용되지 않은 category는 400 INVALID_INQUIRY_CATEGORY', async () => {
    const res = await request(app()).post('/api/inquiries').send({ category: 'etc', content: '문의' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INQUIRY_CATEGORY');
  });

  test('content가 1000자를 초과하면 400 INQUIRY_CONTENT_TOO_LONG', async () => {
    const res = await request(app()).post('/api/inquiries').send({ content: '가'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INQUIRY_CONTENT_TOO_LONG');
    expect(inquiryModel.createInquiry).not.toHaveBeenCalled();
  });

  test('category 생략 시 general로 등록', async () => {
    inquiryModel.createInquiry.mockResolvedValue(inquiryRow);

    const res = await request(app()).post('/api/inquiries').send({ content: ' 배송이 안 와요 ' });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe('INQUIRY_CREATE_SUCCESS');
    expect(inquiryModel.createInquiry).toHaveBeenCalledWith(1, { category: 'general', content: '배송이 안 와요' });
    expect(res.body.data).toEqual({
      inquiryId: 5, category: 'general', content: '배송이 안 와요',
      adminReply: null, status: 'pending', createdAt: inquiryRow.created_at
    });
  });

  test('sanction_appeal 문의 등록', async () => {
    const appealRow = { ...inquiryRow, category: 'sanction_appeal' };
    inquiryModel.createInquiry.mockResolvedValue(appealRow);

    const res = await request(app()).post('/api/inquiries').send({ category: 'sanction_appeal', content: '이의제기합니다' });

    expect(res.status).toBe(201);
    expect(inquiryModel.createInquiry).toHaveBeenCalledWith(1, { category: 'sanction_appeal', content: '이의제기합니다' });
    expect(res.body.data.category).toBe('sanction_appeal');
  });
});

describe('GET /api/inquiries/me', () => {
  test('미인증이면 401', async () => {
    const res = await request(app(null)).get('/api/inquiries/me');
    expect(res.status).toBe(401);
    expect(inquiryModel.getMyInquiries).not.toHaveBeenCalled();
  });

  test('정상 조회 시 200과 페이지 meta', async () => {
    inquiryModel.getMyInquiries.mockResolvedValue({ rows: [inquiryRow], totalCount: 1 });

    const res = await request(app()).get('/api/inquiries/me');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('MY_INQUIRY_LIST_SUCCESS');
    expect(inquiryModel.getMyInquiries).toHaveBeenCalledWith(1, { page: 1, limit: 10, status: null });
    expect(res.body.data[0]).toEqual({
      inquiryId: 5, category: 'general', content: '배송이 안 와요',
      adminReply: null, status: 'pending', createdAt: inquiryRow.created_at
    });
    expect(res.body.meta).toEqual({ page: 1, limit: 10, totalCount: 1, totalPages: 1 });
  });

  test('status 쿼리는 무시하고 항상 전체 조회', async () => {
    inquiryModel.getMyInquiries.mockResolvedValue({ rows: [], totalCount: 0 });

    const res = await request(app()).get('/api/inquiries/me?status=answered');

    expect(res.status).toBe(200);
    expect(inquiryModel.getMyInquiries).toHaveBeenCalledWith(1, { page: 1, limit: 10, status: null });
  });

  test('로그인한 본인 userId로만 조회 — 다른 유저 세션이면 그 유저 id로 호출', async () => {
    inquiryModel.getMyInquiries.mockResolvedValue({ rows: [], totalCount: 0 });

    await request(app(1)).get('/api/inquiries/me');
    expect(inquiryModel.getMyInquiries).toHaveBeenLastCalledWith(1, { page: 1, limit: 10, status: null });

    await request(app(99)).get('/api/inquiries/me');
    expect(inquiryModel.getMyInquiries).toHaveBeenLastCalledWith(99, { page: 1, limit: 10, status: null });
  });

  test('관리자가 답변한 뒤에는 목록에 adminReply와 answered 상태가 반영됨', async () => {
    const answeredRow = { ...inquiryRow, admin_reply: '확인 후 처리했습니다.', status: 'answered' };
    inquiryModel.getMyInquiries.mockResolvedValue({ rows: [answeredRow], totalCount: 1 });

    const res = await request(app()).get('/api/inquiries/me');

    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({
      inquiryId: 5, category: 'general', content: '배송이 안 와요',
      adminReply: '확인 후 처리했습니다.', status: 'answered', createdAt: inquiryRow.created_at
    });
  });
});
