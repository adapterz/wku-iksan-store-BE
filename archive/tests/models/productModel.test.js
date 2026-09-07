jest.mock('../../../db/pool', () => ({
  query: jest.fn()
}));

const pool = require('../../../db/pool');
const productModel = require('../../../db/models/productModel');

describe('productModel.getAllProducts', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('조건이 없으면 카테고리를 조인해 active 상태 상품만 조회', async () => {
    const rows = [{ id: 1, category_id: 1, category_name: '음료' }];
    pool.query.mockResolvedValue([rows]);

    const result = await productModel.getAllProducts();
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('FROM products p');
    expect(query).toContain('JOIN categories c ON p.category_id = c.id');
    expect(query).toContain('LEFT JOIN wishlists w ON w.product_id = p.id');
    expect(query).toContain('GROUP BY p.id, c.name');
    expect(query).toContain("WHERE p.status = 'active'");
    expect(params).toEqual([]);
    expect(result).toEqual(rows);
  });

  test('검색어는 파라미터 바인딩하고 LIKE 특수문자를 일반 문자로 이스케이프', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ keyword: '50%_!' });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain("p.name LIKE ? ESCAPE '!'");
    expect(query).toContain("p.brand LIKE ? ESCAPE '!'");
    expect(params).toEqual([
      '%50!%!_!!%',
      '%50!%!_!!%',
      '50%_!',
      '50%_!',
      '50!%!_!!%',
      '50!%!_!!%',
      '%50!%!_!!%',
      '%50!%!_!!%'
    ]);
  });

  test('완전 일치, 시작 일치, 부분 일치 순으로 상품명과 브랜드명을 정렬', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ keyword: '커피' });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('ORDER BY CASE');
    expect(query).toContain('WHEN p.name = ? THEN 1');
    expect(query).toContain('WHEN p.brand = ? THEN 2');
    expect(query).toContain("WHEN p.name LIKE ? ESCAPE '!' THEN 3");
    expect(query).toContain("WHEN p.brand LIKE ? ESCAPE '!' THEN 4");
    expect(query).toContain("WHEN p.name LIKE ? ESCAPE '!' THEN 5");
    expect(query).toContain("WHEN p.brand LIKE ? ESCAPE '!' THEN 6");
    expect(query).toContain('p.id ASC');
    expect(params).toEqual([
      '%커피%',
      '%커피%',
      '커피',
      '커피',
      '커피%',
      '커피%',
      '%커피%',
      '%커피%'
    ]);
  });

  test('다중 단어는 AND 조회하고 전체 문구와 단어별 관련도로 정렬', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ keyword: '익산   커피' });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain(
      "(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!') AND " +
      "(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!')"
    );
    // 전체 문구 CASE 1개와 검색 단어별 CASE 2개가 모두 정렬에 사용된다.
    expect(query.match(/WHEN p\.name = \? THEN 1/g)).toHaveLength(3);
    expect(params).toEqual([
      '%익산%',
      '%익산%',
      '%커피%',
      '%커피%',
      '익산 커피',
      '익산 커피',
      '익산 커피%',
      '익산 커피%',
      '%익산 커피%',
      '%익산 커피%',
      '익산',
      '익산',
      '익산%',
      '익산%',
      '%익산%',
      '%익산%',
      '커피',
      '커피',
      '커피%',
      '커피%',
      '%커피%',
      '%커피%'
    ]);
  });

  test('빈 문자열이나 공백 검색어는 DB 조회 전에 거부', async () => {
    await expect(productModel.getAllProducts({ keyword: '' }))
      .rejects.toThrow('keyword must be a non-empty string');
    await expect(productModel.getAllProducts({ keyword: '   ' }))
      .rejects.toThrow('keyword must be a non-empty string');

    expect(pool.query).not.toHaveBeenCalled();
  });

  test('카테고리 필터는 category_id를 파라미터로 바인딩', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ categoryId: 2 });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain("WHERE p.status = 'active' AND p.category_id = ?");
    expect(params).toEqual([2]);
  });

  test('검색어와 카테고리를 함께 사용하면 AND 조건으로 조회', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ keyword: '카페', categoryId: 1 });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain("(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!') AND p.category_id = ?");
    expect(params).toEqual([
      '%카페%',
      '%카페%',
      1,
      '카페',
      '카페',
      '카페%',
      '카페%',
      '%카페%',
      '%카페%'
    ]);
  });

  test('브랜드 필터는 brand를 파라미터로 바인딩', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ brand: '익산로컬푸드' });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain("WHERE p.status = 'active' AND p.brand = ?");
    expect(params).toEqual(['익산로컬푸드']);
  });

  test('검색어·카테고리·브랜드를 함께 사용하면 AND 조건으로 조회', async () => {
    pool.query.mockResolvedValue([[]]);

    await productModel.getAllProducts({ keyword: '카페', categoryId: 1, brand: '익산로컬푸드' });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain(
      "(p.name LIKE ? ESCAPE '!' OR p.brand LIKE ? ESCAPE '!') AND p.category_id = ? AND p.brand = ?"
    );
    expect(params).toEqual([
      '%카페%',
      '%카페%',
      1,
      '익산로컬푸드',
      '카페',
      '카페',
      '카페%',
      '카페%',
      '%카페%',
      '%카페%'
    ]);
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
    expect(query).toContain("WHERE p.status = 'active'");
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
    expect(query).toContain("WHERE p.id = ? AND p.status = 'active'");
    expect(params).toEqual([1]);
    expect(result).toEqual(product);
  });

  test('상품이 없으면 null 반환', async () => {
    pool.query.mockResolvedValue([[]]);

    const result = await productModel.getProductById(999);

    expect(result).toBeNull();
  });

  test('숨김 상품은 조회되지 않음(상태 필터로 걸러짐, 모델은 SQL 위임)', async () => {
    pool.query.mockResolvedValue([[]]);

    const result = await productModel.getProductById(1);
    const [query] = pool.query.mock.calls[0];

    expect(query).toContain("p.status = 'active'");
    expect(result).toBeNull();
  });
});

describe('productModel.getProductByIdIgnoringStatus', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('상태와 무관하게 상품을 조회하고 status를 함께 반환', async () => {
    const product = { id: 1, name: '상품A', status: 'hidden' };
    pool.query.mockResolvedValue([[product]]);

    const result = await productModel.getProductByIdIgnoringStatus(1);
    const [query, params] = pool.query.mock.calls[0];

    expect(query).not.toContain("status = 'active'");
    expect(query).toContain('p.status');
    expect(params).toEqual([1]);
    expect(result).toEqual(product);
  });
});

describe('productModel.createProduct', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('전달된 필드로 INSERT 후 생성된 상품을 재조회', async () => {
    pool.query
      .mockResolvedValueOnce([{ insertId: 5 }])
      .mockResolvedValueOnce([[{ id: 5, name: '새 상품', status: 'active' }]]);

    const result = await productModel.createProduct({
      name: '새 상품',
      brand: '테스트브랜드',
      price: 1000,
      category_id: 1
    });

    const [insertQuery, insertParams] = pool.query.mock.calls[0];
    expect(insertQuery).toContain('INSERT INTO products');
    expect(insertParams).toEqual(['새 상품', '테스트브랜드', 1000, null, null, null, null, null, null, null, 1]);
    expect(result).toEqual({ id: 5, name: '새 상품', status: 'active' });
  });
});

describe('productModel.updateProduct', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('전달된 필드만 부분 수정', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 1, price: 2000 }]]);

    const result = await productModel.updateProduct(1, { price: 2000 });
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toBe('UPDATE products SET price = ? WHERE id = ?');
    expect(params).toEqual([2000, 1]);
    expect(result).toEqual({ id: 1, price: 2000 });
  });

  test('상품이 없으면 null 반환', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await productModel.updateProduct(999, { price: 2000 });

    expect(result).toBeNull();
  });
});

describe('productModel.updateProductStatus', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('상태 변경 후 갱신된 상품을 재조회', async () => {
    pool.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 1, status: 'hidden' }]]);

    const result = await productModel.updateProductStatus(1, 'hidden');

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'UPDATE products SET status = ? WHERE id = ?',
      ['hidden', 1]
    );
    expect(result).toEqual({ id: 1, status: 'hidden' });
  });

  test('상품이 없으면 null 반환', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 0 }]);

    const result = await productModel.updateProductStatus(999, 'hidden');

    expect(result).toBeNull();
  });
});
