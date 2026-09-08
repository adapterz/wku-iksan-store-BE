jest.mock('../../../db/pool', () => ({ query: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/dashboardModel');

beforeEach(() => jest.resetAllMocks());

describe('getProductStats', () => {
  test('활성 상품 개수, 브랜드별 집계, 숨김 상품 개수를 함께 반환', async () => {
    pool.query
      .mockResolvedValueOnce([[{ total: 42 }]])
      .mockResolvedValueOnce([[{ brand: '나이키', count: 12 }, { brand: '아디다스', count: 8 }]])
      .mockResolvedValueOnce([[{ total: 3 }]]);

    const result = await model.getProductStats();

    expect(result).toEqual({
      totalCount: 42,
      byBrand: [{ brand: '나이키', count: 12 }, { brand: '아디다스', count: 8 }],
      hiddenCount: 3
    });
    expect(pool.query.mock.calls[0][0]).toContain("status = 'active'");
    expect(pool.query.mock.calls[2][0]).toContain("status = 'hidden'");
  });
});

describe('countActiveSuspensions', () => {
  test('활성 정지 이력이 없으면 0', async () => {
    pool.query.mockResolvedValueOnce([[]]);
    expect(await model.countActiveSuspensions()).toBe(0);
  });

  test('만료되지 않은 정지의 유저 수만 센다(자연 만료·중복 유저는 제외)', async () => {
    const future = new Date(Date.now() + 1000 * 60 * 60);
    const past = new Date(Date.now() - 1000 * 60 * 60);
    pool.query.mockResolvedValueOnce([[
      { user_id: 1, ends_at: future },
      { user_id: 1, ends_at: future }, // 같은 유저의 다른 정지 건 — 중복 집계 방지
      { user_id: 2, ends_at: past },   // 자연 만료 — status는 active지만 카운트 제외
      { user_id: 3, ends_at: future }
    ]]);

    expect(await model.countActiveSuspensions()).toBe(2);
  });
});
