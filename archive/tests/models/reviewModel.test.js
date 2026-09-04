jest.mock('../../../db/pool', () => ({ getConnection: jest.fn(), query: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/reviewModel');
let connection;
const gift = { id: 7, receiver_id: 1, product_id: 3, status: 'used', payment_status: 'paid' };
const body = { giftId: 7, rating: 5, content: "후기 ' ?" };
beforeEach(() => {
  jest.resetAllMocks();
  connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn() };
  pool.getConnection.mockResolvedValue(connection);
});

test('작성 자격·닉네임을 잠금 조회하고 스냅샷 INSERT 후 반환', async () => {
  const row = { id: 9 };
  connection.query.mockResolvedValueOnce([[{ nickname: '기록닉네임' }]])
    .mockResolvedValueOnce([[gift]]).mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([{ insertId: 9 }]).mockResolvedValueOnce([[row]]);
  expect(await model.createReview(1, body)).toEqual(row);
  expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(connection.query.mock.calls[1][0]).toContain('FOR UPDATE');
  const [sql, params] = connection.query.mock.calls[3];
  expect(sql).toContain('reviewer_nickname_snapshot');
  expect(sql).not.toContain(body.content);
  expect(params).toEqual([3, 7, 1, '기록닉네임', 5, body.content]);
  expect(connection.commit).toHaveBeenCalledTimes(1);
  expect(connection.release).toHaveBeenCalledTimes(1);
});
test.each([
  [{ ...gift, receiver_id: 2 }], [{ ...gift, status: 'unused' }], [{ ...gift, payment_status: 'pending' }]
])('작성 자격 없는 선물 거부 %p', async invalid => {
  connection.query.mockResolvedValueOnce([[{ nickname: '나' }]]).mockResolvedValueOnce([[invalid]]);
  await expect(model.createReview(1, body)).rejects.toMatchObject({ reviewError: 'GIFT_NOT_REVIEWABLE' });
  expect(connection.query).toHaveBeenCalledTimes(2);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.release).toHaveBeenCalledTimes(1);
});
test('탈퇴한 회원의 이전 세션은 작성 거부', async () => {
  connection.query.mockResolvedValueOnce([[]]);
  await expect(model.createReview(1, body)).rejects.toMatchObject({ reviewError: 'UNAUTHORIZED' });
});
test('없는 선물 거부', async () => {
  connection.query.mockResolvedValueOnce([[{ nickname: '나' }]]).mockResolvedValueOnce([[]]);
  await expect(model.createReview(1, body)).rejects.toMatchObject({ reviewError: 'GIFT_NOT_FOUND' });
});
test('숨김 여부와 관계없이 기존 리뷰 거부', async () => {
  connection.query.mockResolvedValueOnce([[{ nickname: '나' }]]).mockResolvedValueOnce([[gift]]).mockResolvedValueOnce([[{ id: 9 }]]);
  await expect(model.createReview(1, body)).rejects.toMatchObject({ reviewError: 'REVIEW_ALREADY_EXISTS' });
  expect(connection.query.mock.calls[2][0]).not.toContain('visible');
});
test('INSERT 중 UNIQUE 위반은 rollback/release 후 상위 전달', async () => {
  connection.query.mockResolvedValueOnce([[{ nickname: '나' }]]).mockResolvedValueOnce([[gift]]).mockResolvedValueOnce([[]])
    .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
  await expect(model.createReview(1, body)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});
test.each([
  ['latest', 'r.created_at DESC, r.id DESC'],
  ['rating_desc', 'r.rating DESC, r.created_at DESC, r.id DESC'],
  ['rating_asc', 'r.rating ASC, r.created_at DESC, r.id DESC']
])('공개 목록 %s는 공개 통계/안정 정렬/바인딩 사용', async (sort, order) => {
  connection.query.mockResolvedValueOnce([[{ review_count: 12, average_rating: '4.5000' }]]).mockResolvedValueOnce([[]]);
  const result = await model.getProductReviews(3, { page: 2, limit: 10, sort });
  expect(result).toEqual({ rows: [], reviewCount: 12, averageRating: 4.5 });
  expect(connection.query.mock.calls[0][0]).toContain("status = 'visible'");
  expect(connection.query.mock.calls[1][0]).toContain("r.status = 'visible'");
  expect(connection.query.mock.calls[1][0]).toContain(order);
  expect(connection.query.mock.calls[1][1]).toEqual([3, 10, 10]);
  expect(connection.commit).toHaveBeenCalled();
});
test('모델도 화이트리스트 밖 정렬 거부', async () => {
  await expect(model.getProductReviews(3, { page: 1, limit: 10, sort: '__proto__' })).rejects.toThrow(TypeError);
  expect(pool.getConnection).not.toHaveBeenCalled();
});
test('내 목록은 소유자 필터와 상품 필터 적용, 숨김도 조회', async () => {
  connection.query.mockResolvedValueOnce([[{ total: 1 }]]).mockResolvedValueOnce([[{ id: 9 }]]);
  await model.getMyReviews(1, { page: 1, limit: 10, productId: 3 });
  expect(connection.query.mock.calls[1][1]).toEqual([1, 3, 10, 0]);
  expect(connection.query.mock.calls[1][0]).not.toContain("status = 'visible'");
});
test('단건은 users 조인 없이 탈퇴 후에도 조회 가능', async () => {
  pool.query.mockResolvedValue([[{ id: 9, user_id: null }]]);
  expect(await model.getReviewById(9)).toEqual({ id: 9, user_id: null });
  expect(pool.query.mock.calls[0][0]).not.toContain('JOIN users');
});
test('부분 수정은 소유권을 잠그고 허용 필드만 변경', async () => {
  connection.query.mockResolvedValueOnce([[{ user_id: 1 }]]).mockResolvedValueOnce([{ affectedRows: 1 }])
    .mockResolvedValueOnce([[{ id: 9, rating: 3 }]]);
  await model.updateReview(9, 1, { rating: 3, status: 'visible' });
  expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(connection.query.mock.calls[1]).toEqual(['UPDATE reviews SET rating = ? WHERE id = ? AND user_id = ?', [3, 9, 1]]);
});
test.each([null, 2])('탈퇴/타인 소유 %p는 변경 불가', async user_id => {
  connection.query.mockResolvedValueOnce([[{ user_id }]]);
  await expect(model.deleteReview(9, 1)).rejects.toMatchObject({ reviewError: 'FORBIDDEN_NOT_REVIEW_OWNER' });
  expect(connection.query).toHaveBeenCalledTimes(1);
});
test('없는 리뷰 변경은 404', async () => {
  connection.query.mockResolvedValueOnce([[]]);
  await expect(model.updateReview(9, 1, { rating: 3 })).rejects.toMatchObject({ reviewError: 'REVIEW_NOT_FOUND' });
});
test('삭제는 ID와 소유자를 함께 조건으로 사용', async () => {
  connection.query.mockResolvedValueOnce([[{ user_id: 1 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
  expect(await model.deleteReview(9, 1)).toEqual({ reviewId: 9 });
  expect(connection.query.mock.calls[1]).toEqual(['DELETE FROM reviews WHERE id = ? AND user_id = ?', [9, 1]]);
});
test('트랜잭션 시작 실패도 연결 반환', async () => {
  connection.beginTransaction.mockRejectedValue(new Error('begin'));
  await expect(model.deleteReview(9, 1)).rejects.toThrow('begin');
  expect(connection.rollback).not.toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});
