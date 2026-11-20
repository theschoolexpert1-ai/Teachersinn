'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teachersinn-proxy-test-'));
process.env.TEACHERSINN_DATA_DIR = dataDir;
process.env.DATA_BACKEND = 'sqlite';
process.env.AUTH_BACKEND = 'legacy';
process.env.TRUST_PROXY = '0';
process.env.COOKIE_SECURE = '0';
process.env.ADMIN_EMAIL = 'proxy-test@test.local';
process.env.ADMIN_PASSWORD = 'ProxyTestPassword2026';

const server = require('../src/server');
const { db } = require('../src/db');
let baseUrl;

test.before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('forwarded HTTPS is ignored when proxy trust is disabled', async () => {
  const response = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.50' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^tin_sid=/);
  assert.doesNotMatch(cookie, /; Secure(?:;|$)/);
  assert.equal(response.headers.get('strict-transport-security'), null);
});
