describe('MySQL DATETIME timezone contract', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
    jest.resetModules();
    jest.dontMock('mysql2/promise');
    jest.dontMock('dotenv');
  });

  test.each(['UTC', 'Asia/Seoul'])('uses KST conversion when Node TZ=%s', timezone => {
    process.env.TZ = timezone;
    const sentinel = {};
    const createPool = jest.fn(() => sentinel);
    jest.doMock('mysql2/promise', () => ({ createPool }));
    jest.doMock('dotenv', () => ({ config: jest.fn() }));
    jest.isolateModules(() => {
      expect(require('../../db/pool')).toBe(sentinel);
    });
    expect(createPool).toHaveBeenCalledWith(expect.objectContaining({
      timezone: '+09:00', connectionLimit: 10
    }));
  });
});
