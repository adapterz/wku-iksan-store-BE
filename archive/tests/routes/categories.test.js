const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

jest.mock('../../../db/models/categoryModel');
const categoryModel = require('../../../db/models/categoryModel');
const categoriesRouter = require('../../../routes/categories');

describe('GET /api/categories', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('목록을 id 오름차순으로 반환', async () => {
    categoryModel.getAllCategories.mockResolvedValue([
      { id: 1, name: '음료' },
      { id: 2, name: '베이커리' }
    ]);
    const app = createTestApp('/api/categories', categoriesRouter);

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('CATEGORY_LIST_SUCCESS');
    expect(res.body.data).toEqual([
      { id: 1, name: '음료' },
      { id: 2, name: '베이커리' }
    ]);
  });

  test('카테고리가 없으면 빈 배열 반환', async () => {
    categoryModel.getAllCategories.mockResolvedValue([]);
    const app = createTestApp('/api/categories', categoriesRouter);

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(res.body.code).toBe('CATEGORY_LIST_SUCCESS');
    expect(res.body.data).toEqual([]);
  });

  test('DB 오류가 나면 기본 500 오류 응답', async () => {
    categoryModel.getAllCategories.mockRejectedValue(new Error('DB down'));
    const app = createTestApp('/api/categories', categoriesRouter);

    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
