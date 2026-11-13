// Local-only regression checks for the development dependency patch (#160).
// Resource-consumption inputs run in bounded child processes, never via HTTP.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const lock = require('../package-lock.json');

const packages = Object.entries(lock.packages)
  .filter(([name]) => name.endsWith('/brace-expansion'));
assert.equal(packages.length, 2, 'Review the dependency paths if the toolchain changes');
const approvedBraceVersions = new Set(['1.1.22', '5.0.13']);

let passed = 0;
for (const [name, metadata] of packages) {
  assert.ok(approvedBraceVersions.has(metadata.version), `Unexpected version in ${name}`);
  const filename = require.resolve(path.join(root, name));
  const module = require(filename);
  const expand = typeof module === 'function' ? module : module.expand;
  assert.deepEqual(expand('src/{one,two}.js'), ['src/one.js', 'src/two.js']);
  assert.deepEqual(expand('file{1..3}.js'), ['file1.js', 'file2.js', 'file3.js']);
  assert.deepEqual(expand('a{b,{c,d}}'), ['ab', 'ac', 'ad']);
  passed += 3;

  for (const kind of ['rewrite', 'nesting']) {
    const output = execFileSync(process.execPath, ['-e', `
      const m = require(process.argv[1]);
      const expand = typeof m === 'function' ? m : m.expand;
      const input = process.argv[2] === 'rewrite'
        ? '{a}' + '}'.repeat(64000) + ',z}'
        : '{'.repeat(6000) + 'x,y' + '}'.repeat(6000);
      const output = expand(input);
      if (!Array.isArray(output)) throw new Error('Expected expansion result array');
      console.log('ok');
    `, filename, kind], {
      timeout: 5000, maxBuffer: 4096, encoding: 'utf8', windowsHide: true
    });
    assert.equal(output.trim(), 'ok');
    passed++;
  }
  console.log(`PASS ${name}@${metadata.version}: 3 normal patterns + 2 bounded cases`);
}

assert.equal(lock.packages['node_modules/nodemon'], undefined);
passed++;
assert.ok(Object.entries(lock.packages).every(([name, metadata]) =>
  !name.endsWith('/minimatch') || metadata.version !== '10.2.5'));
passed++;

const glob = require('glob');
assert.equal(require('glob/package.json').version, '14.0.5');
// Resolve from each real consumer so a new nested vulnerable copy cannot go unnoticed.
for (const consumer of ['@jest/reporters', 'jest-config', 'jest-runtime']) {
  const fromConsumer = createRequire(require.resolve(consumer));
  assert.equal(fromConsumer('glob/package.json').version, '14.0.5');
  passed++;
}
const fromGlob = createRequire(require.resolve('glob'));
assert.equal(fromGlob('minimatch/package.json').version, '11.0.8');
passed++;
const files = glob.sync('controllers/{auth,products}Controller.js', { cwd: root });
assert.deepEqual(files.map(file => file.split(path.sep).join('/')).sort(),
  ['controllers/authController.js', 'controllers/productsController.js']);
passed++;

const ignored = glob.sync('controllers/{auth,products}Controller.js', {
  cwd: root, ignore: '**/authController.js', windowsPathsNoEscape: true
});
assert.deepEqual(ignored.map(file => file.split(path.sep).join('/')), ['controllers/productsController.js']);
passed++;

(async () => {
  const asynchronous = await glob.glob('controllers/{auth,products}Controller.js', { cwd: root });
  assert.deepEqual(asynchronous.map(file => file.split(path.sep).join('/')).sort(),
    ['controllers/authController.js', 'controllers/productsController.js']);
  passed++;
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(glob.glob('**/*.js', { cwd: root, signal: abort.signal }), { name: 'AbortError' });
  passed++;
  console.log(`${passed} development dependency checks passed`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
