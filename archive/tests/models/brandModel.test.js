jest.mock('../../../db/pool', () => ({
  query: jest.fn()
}));

const pool = require('../../../db/pool');
const brandModel = require('../../../db/models/brandModel');

describe('brandModel.getBrands', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('keyword가 없으면 상품 수 내림차순으로 상위 4개만 조회', async () => {
    const rows = [{ brand: '익산로컬푸드', product_count: 2, thumbnail_url: 'a.jpg' }];
    pool.query.mockResolvedValue([rows]);

    const result = await brandModel.getBrands();
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('FROM products p');
    expect(query).not.toContain('p.brand LIKE');
    expect(query).toContain('GROUP BY p.brand');
    expect(query).toContain('ORDER BY product_count DESC, p.brand ASC');
    expect(query).toContain('LIMIT ?');
    expect(params).toEqual([4]);
    expect(result).toEqual(rows);
  });

  test('keyword가 있으면 brand LIKE 조건으로 검색하고 상위 개수 제한은 없음', async () => {
    pool.query.mockResolvedValue([[]]);

    await brandModel.getBrands({ keyword: '로컬' });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain("WHERE p.brand LIKE ? ESCAPE '!'");
    expect(query).not.toContain('LIMIT ?');
    expect(params).toEqual(['%로컬%']);
  });

  test('검색어의 LIKE 특수문자를 일반 문자로 이스케이프', async () => {
    pool.query.mockResolvedValue([[]]);

    await brandModel.getBrands({ keyword: '50%_!' });
    const [, params] = pool.query.mock.calls[0];

    expect(params).toEqual(['%50!%!_!!%']);
  });
});
