jest.mock('../../../db/pool', () => ({
  query: jest.fn()
}));

const pool = require('../../../db/pool');
const productModel = require('../../../db/models/productModel');

describe('productModel.getAllProducts', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('조건이 없으면 카테고리를 조인해 전체 상품을 조회', async () => {
    const rows = [{ id: 1, category_id: 1, category_name: '음료' }];
    pool.query.mockResolvedValue([rows]);

    const result = await productModel.getAllProducts();
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('FROM products p');
    expect(query).toContain('JOIN categories c ON p.category_id = c.id');
    expect(query).not.toContain('WHERE');
    expect(params).toEqual([]);
    expect(result).toEqual(rows);
  });

  test('검색어는 파라미터 바인딩하고 LIKE 특수문자를 일반 문자로 이스케이프', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ keyword: '50%_!' });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain("p.name LIKE ? ESCAPE '!'");
    expect(query).toContain("p.brand LIKE ? ESCAPE '!'");
    expect(params).toEqual(['%50!%!_!!%', '%50!%!_!!%']);
  });

  test('카테고리 필터는 category_id를 파라미터로 바인딩', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ categoryId: 2 });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('WHERE p.category_id = ?');
    expect(params).toEqual([2]);
  });

  test('검색어와 카테고리를 함께 사용하면 AND 조건으로 조회', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ keyword: '카페', categoryId: 1 });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain("(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!') AND p.category_id = ?");
    expect(params).toEqual(['%카페%', '%카페%', 1]);
  });
});

describe('productModel.getProductRanking', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('찜 개수 내림차순으로 정렬하고 찜이 없는 상품은 제외', async () => {
    const rows = [
      { id: 1, category_id: 1, category_name: '음료', wishlist_count: 5 }
    ];
    pool.query.mockResolvedValue([rows]);

    const result = await productModel.getProductRanking();
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('LEFT JOIN wishlists w ON w.product_id = p.id');
    expect(query).toContain('GROUP BY p.id, c.name');
    expect(query).toContain('HAVING wishlist_count > 0');
    expect(query).toContain('ORDER BY wishlist_count DESC, p.id ASC');
    expect(query).toContain('LIMIT ?');
    expect(params).toEqual([productModel.PRODUCT_RANKING_LIMIT]);
    expect(result).toEqual(rows);
  });
});

describe('productModel.getProductById', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('상품 상세 조회 시 카테고리를 조인해 함께 반환', async () => {
    const product = {
      id: 1,
      name: '상품A',
      category_id: 2,
      category_name: '간식'
    };
    pool.query.mockResolvedValue([[product]]);

    const result = await productModel.getProductById(1);
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('FROM products p');
    expect(query).toContain('JOIN categories c ON p.category_id = c.id');
    expect(query).toContain('WHERE p.id = ?');
    expect(params).toEqual([1]);
    expect(result).toEqual(product);
  });

  test('상품이 없으면 null 반환', async () => {
    pool.query.mockResolvedValue([[]]);

    const result = await productModel.getProductById(999);

    expect(result).toBeNull();
  });
});
