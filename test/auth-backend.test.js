'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { authBackend, createAuthRuntime } = require('../src/auth');

test('legacy authentication remains the default and invalid flags fail closed', () => {
  assert.equal(authBackend({}), 'legacy');
  assert.equal(createAuthRuntime({ env: {} }).mode, 'legacy');
  assert.throws(() => authBackend({ AUTH_BACKEND: 'mixed' }), /Unsupported AUTH_BACKEND/);
});

test('Supabase authentication requires complete server-only configuration', () => {
  assert.throws(() => createAuthRuntime({ env: { AUTH_BACKEND: 'supabase' } }), /SUPABASE_URL is required/);
  const base = {
    AUTH_BACKEND: 'supabase', SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable', SUPABASE_SECRET_KEY: 'secret', APP_ORIGIN: 'https://app.example',
  };
  assert.throws(() => createAuthRuntime({ env: base }), /AUTH_COOKIE_SECRET/);
});

test('Supabase session envelopes are authenticated, encrypted and tamper-evident', () => {
  const runtime = createAuthRuntime({ env: {
    AUTH_BACKEND: 'supabase', SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable', SUPABASE_SECRET_KEY: 'secret',
    AUTH_COOKIE_SECRET: 'a development-only secret with at least 32 characters',
    APP_ORIGIN: 'https://app.example', COOKIE_SECURE: '1',
  }, clientFactory() { throw new Error('network must not be used by this unit test'); } });
  assert.equal(runtime.bridge.name, '__Host-tin_sbauth');
  const payload = { access_token: 'access', refresh_token: 'refresh', expires_at: 123, csrf_token: 'csrf' };
  const sealed = runtime.bridge._test.seal(payload);
  assert.equal(sealed.includes('access'), false);
  assert.deepEqual(runtime.bridge._test.open(sealed), payload);
  const tamperAt = Math.floor(sealed.length / 2);
  const tampered = sealed.slice(0, tamperAt) + (sealed[tamperAt] === 'A' ? 'B' : 'A') + sealed.slice(tamperAt + 1);
  assert.equal(runtime.bridge._test.open(tampered), null);
});
