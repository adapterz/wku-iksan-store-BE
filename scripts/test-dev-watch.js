// Exercise the actual Node watch process using disposable local fixtures only.
// No application .env, DB, network listener, or external package is required.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const pkg = require('../package.json');

const alive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};

async function main() {
  assert.equal(pkg.scripts.dev, 'node --watch app.js');
  assert.equal(pkg.devDependencies.nodemon, undefined);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'iksan-dev-watch-'));
  const entry = path.join(dir, 'app.js');
  const dependency = path.join(dir, 'value.js');
  const records = [];
  let output = '', pending = '', child, closed = false, spawnError;
  let childClosed;
  async function waitFor(predicate, label) {
    const deadline = Date.now() + 15000;
    while (!predicate()) {
      if (spawnError) throw spawnError;
      if (Date.now() > deadline) throw new Error(`${label} timed out\n${output}`);
      await delay(50);
    }
  }
  try {
    await fs.writeFile(dependency, "module.exports = 'before';\n");
    await fs.writeFile(entry, `
      const value = require('./value');
      console.log('WATCH_READY ' + JSON.stringify({ pid: process.pid, value }));
      setInterval(() => {}, 1000);
    `);
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    child = spawn(process.execPath, ['--watch', 'app.js'], {
      cwd: dir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']
    });
    childClosed = new Promise(resolve => child.once('close', () => { closed = true; resolve(); }));
    child.on('error', error => { spawnError = error; });
    child.stderr.on('data', data => { output += data.toString(); });
    child.stdout.on('data', data => {
      output += data.toString();
      pending += data.toString();
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line.startsWith('WATCH_READY ')) records.push(JSON.parse(line.slice(12)));
      }
    });
    await waitFor(() => records.length === 1, 'initial startup');
    assert.equal(records[0].value, 'before');
    await delay(500); // Allow the dependency-watch subscription to settle.

    await fs.writeFile(path.join(dir, 'unrelated.js'), "module.exports = 'unrelated';\n");
    await fs.writeFile(path.join(dir, '.env'), 'WATCH_TEST=unrelated\n');
    await delay(1500);
    assert.equal(closed, false);
    assert.equal(records.length, 1, 'Unimported files must not restart the process');

    await fs.writeFile(dependency, "module.exports = 'after';\n");
    await waitFor(() => records.some(record => record.value === 'after'), 'dependency restart');
    assert.notEqual(records.at(-1).pid, records[0].pid);
    await waitFor(() => !alive(records[0].pid), 'previous application exit');
    await delay(500);

    const previous = records.at(-1).pid;
    await fs.appendFile(entry, '\n// Entry file change\n');
    await waitFor(() => records.at(-1).pid !== previous, 'entry restart');
    assert.equal(records.at(-1).value, 'after');
    await waitFor(() => !alive(previous), 'restarted application exit');

    child.kill('SIGTERM');
    await waitFor(() => closed && records.every(record => !alive(record.pid)), 'watch shutdown');
    console.log('6 dev-watch checks passed: configuration, startup, unrelated files, dependency restart, entry restart, shutdown');
  } finally {
    if (child && !closed) {
      child.kill('SIGTERM');
      await Promise.race([childClosed, delay(3000)]);
      if (!closed) {
        child.kill('SIGKILL');
        await Promise.race([childClosed, delay(3000)]);
      }
    }
    // Clean up only the fixture processes whose IDs were emitted by this test.
    for (const record of records) {
      if (alive(record.pid)) process.kill(record.pid, 'SIGKILL');
    }
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
