'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('separated frontend and backend layout is wired through runtime and Vercel configuration', () => {
  assert.equal(fs.existsSync(path.join(root, 'src')), false);
  assert.equal(fs.existsSync(path.join(root, 'public')), false);

  for (const file of ['frontend/index.html', 'frontend/app.js', 'frontend/styles.css',
    'frontend/theme-init.js', 'backend/src/server.js', 'backend/src/data/index.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
  }

  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.main, 'backend/src/server.js');
  assert.match(manifest.scripts.start, /backend\/src\/server\.js/);

  const sqliteServer = read('backend/src/server.js');
  const postgresRuntime = read('backend/src/postgres/runtime.js');
  const database = read('backend/src/db.js');
  assert.match(sqliteServer, /['"]\.\.['"], ['"]\.\.['"], ['"]frontend['"]/);
  assert.match(postgresRuntime, /['"]\.\.['"],['"]\.\.['"],['"]\.\.['"],['"]frontend['"]/);
  assert.match(database, /['"]\.\.['"], ['"]\.\.['"], ['"]data['"]/);

  const adapter = read('server.js');
  assert.match(adapter, /require\(['"]\.\/backend\/src\/server['"]\)/);
  assert.match(adapter, /server\.listen/);

  const vercel = JSON.parse(read('vercel.json'));
  assert.deepEqual(vercel.functions['server.js'].includeFiles, ['backend/src/**', 'frontend/**']);
  const ignored = read('.vercelignore');
  assert.match(ignored, /(?:^|\r?\n)data\//);
  assert.match(ignored, /(?:^|\r?\n)\.private\//);
  assert.doesNotMatch(ignored, /(?:^|\r?\n)(?:frontend|backend)\//);
});
