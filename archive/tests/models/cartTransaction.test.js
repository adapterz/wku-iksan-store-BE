jest.mock('../../../db/pool', () => ({getConnection:jest.fn()}));
const pool = require('../../../db/pool');
const {transaction,lockUsers} = require('../../../db/models/cartTransaction');
const connection = () => ({beginTransaction:jest.fn().mockResolvedValue(),commit:jest.fn().mockResolvedValue(),rollback:jest.fn().mockResolvedValue(),release:jest.fn(),query:jest.fn()});
beforeEach(()=>jest.resetAllMocks());
afterEach(()=>jest.restoreAllMocks());
test('deadlock rolls back and releases connection before bounded retry',async()=>{
  const first=connection(),second=connection();pool.getConnection.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const work=jest.fn().mockRejectedValueOnce({code:'ER_LOCK_DEADLOCK'}).mockResolvedValueOnce('ok');
  expect(await transaction(work)).toBe('ok');expect(first.rollback).toHaveBeenCalledTimes(1);expect(first.release).toHaveBeenCalledTimes(1);expect(second.commit).toHaveBeenCalledTimes(1);expect(second.release).toHaveBeenCalledTimes(1);
});
test('deadlocks are attempted at most three times',async()=>{
  const db=connection();pool.getConnection.mockResolvedValue(db);const error={code:'ER_LOCK_DEADLOCK'};
  await expect(transaction(()=>Promise.reject(error))).rejects.toBe(error);expect(pool.getConnection).toHaveBeenCalledTimes(3);expect(db.release).toHaveBeenCalledTimes(3);
});
test('uncertain commit result is never retried automatically',async()=>{
  const db=connection();pool.getConnection.mockResolvedValue(db);const error={code:'ECONNRESET'};db.commit.mockRejectedValue(error);
  const work=jest.fn().mockResolvedValue('created');await expect(transaction(work)).rejects.toBe(error);expect(work).toHaveBeenCalledTimes(1);expect(db.release).toHaveBeenCalledTimes(1);
});
test('rollback failure does not hide original error or leak connection',async()=>{
  const db=connection();pool.getConnection.mockResolvedValue(db);db.rollback.mockRejectedValue({code:'ECONNRESET'});jest.spyOn(console,'error').mockImplementation(()=>{});
  const error={code:'ER_SIGNAL_EXCEPTION'};await expect(transaction(()=>Promise.reject(error))).rejects.toBe(error);expect(db.release).toHaveBeenCalledTimes(1);
});
test('failed begin still releases connection',async()=>{
  const db=connection();pool.getConnection.mockResolvedValue(db);db.beginTransaction.mockRejectedValue(new Error('begin failed'));
  await expect(transaction(jest.fn())).rejects.toThrow('begin failed');expect(db.rollback).not.toHaveBeenCalled();expect(db.release).toHaveBeenCalledTimes(1);
});
test('sender and recipient locks use ascending member IDs; self is locked once',async()=>{
  const db=connection();db.query.mockImplementation(async(_,args)=>[[{id:args[0],nickname:'name'}]]);
  await lockUsers(db,10,2);expect(db.query.mock.calls.map(call=>call[1][0])).toEqual([2,10]);db.query.mockClear();await lockUsers(db,10,10);expect(db.query).toHaveBeenCalledTimes(1);
});
