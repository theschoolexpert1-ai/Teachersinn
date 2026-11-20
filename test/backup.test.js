'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('SQLite backup rehearsal restores records and passes integrity checks', () => {
  const script = path.join(__dirname, '..', 'scripts', 'verify-backup.js');
  const result = spawnSync(process.execPath, ['--no-warnings', script], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /"method": "node:sqlite backup API"/);
  assert.match(result.stdout, /"integrity": "ok"/);
  assert.match(result.stdout, /"foreignKeyViolations": 0/);
  assert.match(result.stdout, /"currentVersion": "0004"/);
  assert.match(result.stdout, /"migrations": 4/);
  assert.match(result.stdout, /"enrollment": 1/);
});
