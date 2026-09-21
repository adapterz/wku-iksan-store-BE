jest.mock('../../../db/pool', () => ({ query: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/inquiryModel');

beforeEach(() => jest.resetAllMocks());

describe('lockInquiryById', () => {
  test('FOR UPDATE로 잠근 뒤 행을 반환', async () => {
    const connection = { query: jest.fn().mockResolvedValue([[{ id: 5, status: 'pending' }]]) };

    const result = await model.lockInquiryById(5, connection);

    expect(result).toEqual({ id: 5, status: 'pending' });
    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
  });

  test('없는 문의는 null 반환', async () => {
    const connection = { query: jest.fn().mockResolvedValue([[]]) };

    expect(await model.lockInquiryById(999, connection)).toBeNull();
  });
});

describe('answerInquiry', () => {
  const pending = { id: 5, admin_reply: null, resolved_sanction_id: null, status: 'pending' };
  const answered = { id: 5, admin_reply: '확인했습니다', resolved_sanction_id: null, status: 'answered' };
  const answeredWithSanction = { id: 5, admin_reply: '정지를 해제했습니다', resolved_sanction_id: 42, status: 'answered' };

  test('내용이 다르면 UPDATE 후 최신 행을 다시 조회', async () => {
    pool.query
      .mockResolvedValueOnce([[pending]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[answered]]);

    const result = await model.answerInquiry(5, '확인했습니다');

    expect(result).toEqual(answered);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[1][0]).toContain('UPDATE');
    // resolvedSanctionId 생략 시 null로 저장된다.
    expect(pool.query.mock.calls[1][1]).toEqual(['확인했습니다', null, 5]);
  });

  test('같은 내용으로 재시도해도 UPDATE 없이 그대로 반환 (재시도에도 멱등)', async () => {
    pool.query.mockResolvedValueOnce([[answered]]);

    const result = await model.answerInquiry(5, '확인했습니다');

    expect(result).toEqual(answered);
    // SELECT 한 번뿐, UPDATE 쿼리는 실행되지 않아야 한다.
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  test('resolvedSanctionId와 함께 저장하고, 같은 sanctionId로 재시도하면 멱등', async () => {
    pool.query
      .mockResolvedValueOnce([[pending]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[answeredWithSanction]]);

    const result = await model.answerInquiry(5, '정지를 해제했습니다', 42);

    expect(result).toEqual(answeredWithSanction);
    expect(pool.query.mock.calls[1][1]).toEqual(['정지를 해제했습니다', 42, 5]);

    jest.resetAllMocks();
    pool.query.mockResolvedValueOnce([[answeredWithSanction]]);
    const retryResult = await model.answerInquiry(5, '정지를 해제했습니다', 42);

    expect(retryResult).toEqual(answeredWithSanction);
    expect(pool.query).toHaveBeenCalledTimes(1);
  });

  // PR #100 리뷰 코멘트: 답변 문구만 같고 resolvedSanctionId가 다르면 "같은 요청의
  // 재시도"가 아니라 서로 다른 처리이므로, 문구가 같아도 다시 UPDATE가 실행돼야
  // 컨트롤러가 이 차이를 감지해 충돌로 처리할 수 있다.
  test('답변 문구가 같아도 resolvedSanctionId가 다르면 다시 UPDATE', async () => {
    pool.query
      .mockResolvedValueOnce([[answeredWithSanction]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ ...answeredWithSanction, resolved_sanction_id: 99 }]]);

    const result = await model.answerInquiry(5, '정지를 해제했습니다', 99);

    expect(result.resolved_sanction_id).toBe(99);
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(pool.query.mock.calls[1][1]).toEqual(['정지를 해제했습니다', 99, 5]);
  });

  test('없는 문의는 null 반환, UPDATE 시도 안 함', async () => {
    pool.query.mockResolvedValueOnce([[]]);

    expect(await model.answerInquiry(999, '답변')).toBeNull();
    expect(pool.query).toHaveBeenCalledTimes(1);
  });
});
