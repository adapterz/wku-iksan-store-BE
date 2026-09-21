// DB integration tests exercise MySQL, not a shared Redis instance.
// Install before importing routes: prevent redisClient's import-time connection
// and prevent temporary database fixtures from populating shared cache keys.
const Module = require('node:module');
const filename = require.resolve('../../db/redisClient');
if (require.cache[filename]) throw new Error('Install cache isolation before loading routes');
const stub = new Module(filename, module);
stub.filename = filename;
stub.loaded = true;
stub.exports = {
  get: async () => null,
  set: async () => 'OK',
  keys: async () => [],
  del: async () => 0
};
require.cache[filename] = stub;
