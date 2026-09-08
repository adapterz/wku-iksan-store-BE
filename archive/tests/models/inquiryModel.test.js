jest.mock('../../../db/pool', () => ({ query: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/inquiryModel');

beforeEach(() => jest.resetAllMocks());

describe('answerInquiry', () => {
  const pending = { id: 5, admin_reply: null, status: 'pending' };
  const answered = { id: 5, admin_reply: '확인했습니다', status: 'answered' };

  test('내용이 다르면 UPDATE 후 최신 행을 다시 조회', async () => {
    pool.query
      .mockResolvedValueOnce([[pending]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[answered]]);

    const result = await model.answerInquiry(5, '확인했습니다');

    expect(result).toEqual(answered);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[1][0]).toContain('UPDATE');
  });

  test('같은 내용으로 재시도해도 UPDATE 없이 그대로 반환 (재시도에도 멱등)', async () => {
    pool.query.mockResolvedValueOnce([[answered]]);

    const result = await model.answerInquiry(5, '확인했습니다');

    expect(result).toEqual(answered);
    // SELECT 한 번뿐, UPDATE 쿼리는 실행되지 않아야 한다.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('없는 문의는 null 반환, UPDATE 시도 안 함', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    expect(await model.answerInquiry(999, '답변')).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
