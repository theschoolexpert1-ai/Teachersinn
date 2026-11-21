'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('database initialization failure exits without reporting a running server', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teachersinn-startup-failure-'));
  const blockedPath = path.join(root, 'not-a-directory');
  fs.writeFileSync(blockedPath, 'block directory creation');
  try {
    const result = spawnSync(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'backend', 'src', 'server.js')], {
      encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, TEACHERSINN_DATA_DIR: blockedPath, DATA_BACKEND: 'sqlite', AUTH_BACKEND: 'legacy', PORT: '0' },
    });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stdout, /TeachersInn running/);
    assert.match(result.stderr, /(EEXIST|not-a-directory|directory)/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
