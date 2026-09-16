jest.mock('../../../db/pool', () => ({ query: jest.fn() }));
const pool = require('../../../db/pool');
const model = require('../../../db/models/userModel');
const { MAX_AUTH_VERSION } = require('../../../constants/authVersion');
beforeEach(() => jest.resetAllMocks());
test('인증 조회는 필요한 컬럼만 읽음', async () => {
  pool.query.mockResolvedValue([[{id:1,auth_version:2}]]);
  expect(await model.getAuthStateById(1)).toEqual({id:1,auth_version:2});
  expect(pool.query).toHaveBeenCalledWith('SELECT id, auth_version FROM users WHERE id = ?', [1]);
});
test('비밀번호와 버전은 한 조건부 UPDATE로 갱신', async () => {
  pool.query.mockResolvedValue([{affectedRows:1}]);
  expect(await model.updateUserPassword(1,'hash',2)).toBe(true);
  expect(pool.query).toHaveBeenCalledWith(
    'UPDATE users SET password = ?, auth_version = auth_version + 1 WHERE id = ? AND auth_version = ? AND auth_version < ?',
    ['hash',1,2,MAX_AUTH_VERSION]);
});
test('충돌/회원 없음은 false 반환', async () => {
  pool.query.mockResolvedValue([{affectedRows:0}]);
  expect(await model.updateUserPassword(1,'hash',2)).toBe(false);
});
test.each([0,-1,1.1,'1',undefined,MAX_AUTH_VERSION,MAX_AUTH_VERSION+1])('잘못된/고갈된 버전 %p는 SQL 실행 안 함', async version => {
  await expect(model.updateUserPassword(1,'hash',version)).rejects.toThrow('AUTH_VERSION');
  expect(pool.query).not.toHaveBeenCalled();
});
