jest.mock('../../../db/pool', () => ({
  query: jest.fn()
}));

const pool = require('../../../db/pool');
const wishlistModel = require('../../../db/models/wishlistModel');

describe('wishlistModel', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('찜 등록 후 생성된 행을 조회해 반환', async () => {
    const createdWishlist = {
      id: 10,
      user_id: 1,
      product_id: 3,
      created_at: '2026-08-06T10:00:00.000Z'
    };
    pool.query
      .mockResolvedValueOnce([{ insertId: 10 }])
      .mockResolvedValueOnce([[createdWishlist]]);

    const result = await wishlistModel.createWishlist(1, 3);

    expect(pool.query).toHaveBeenNthCalledWith(
      1,
      'INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)',
      [1, 3]
    );
    expect(pool.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, user_id, product_id, created_at FROM wishlists WHERE id = ?',
      [10]
    );
    expect(result).toEqual(createdWishlist);
  });

  test('찜 해제는 사용자와 상품 ID를 함께 조건으로 사용', async () => {
    pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    const affectedRows = await wishlistModel.deleteWishlist(1, 3);

    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM wishlists WHERE user_id = ? AND product_id = ?',
      [1, 3]
    );
    expect(affectedRows).toBe(1);
  });

  test('찜 목록은 상품·카테고리를 조인하고 최신 등록순으로 조회', async () => {
    const rows = [{ wishlist_id: 10, product_id: 3 }];
    pool.query.mockResolvedValue([rows]);

    const result = await wishlistModel.getWishlistsByUserId(1);
    const [query, params] = pool.query.mock.calls[0];

    expect(query).toContain('FROM wishlists w');
    expect(query).toContain('JOIN products p ON w.product_id = p.id');
    expect(query).toContain('JOIN categories c ON p.category_id = c.id');
    expect(query).toContain('WHERE w.user_id = ?');
    expect(query).toContain('ORDER BY w.created_at DESC');
    expect(params).toEqual([1]);
    expect(result).toEqual(rows);
  });
});
