'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createSupabaseAuthBridge } = require('../backend/src/auth/supabase-bridge');

const url = String(process.env.SUPABASE_TEST_URL || '').trim();
const publishableKey = String(process.env.SUPABASE_TEST_PUBLISHABLE_KEY || '').trim();
const secretKey = String(process.env.SUPABASE_TEST_SECRET_KEY || '').trim();
const projectRef = String(process.env.SUPABASE_TEST_PROJECT_REF || '').trim();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function requireEnvironment() {
  assert.equal(process.env.RUN_SUPABASE_INTEGRATION, '1');
  assert.equal(process.env.SUPABASE_TEST_ALLOW_REMOTE, '1');
  assert.equal(process.env.SUPABASE_TEST_ENVIRONMENT, 'development');
  assert.equal(new URL(url).hostname, `${projectRef}.supabase.co`);
  assert.ok(publishableKey && secretKey);
}

class Response {
  setHeader(name, value) { this[name.toLowerCase()] = value; }
  getHeader(name) { return this[name.toLowerCase()]; }
}
function requestFrom(res) { return { headers: { cookie: String(res.getHeader('set-cookie') || '').split(';', 1)[0] } }; }

test('Supabase Auth bridge handles mapped sessions, refresh, suspension and recovery', async (t) => {
  requireEnvironment();
  const service = createClient(url, secretKey, options);
  const random = crypto.randomBytes(8).toString('hex');
  const email = `stage-b-${random}@example.com`;
  const confirmationEmail = `stage-b-confirmation-${random}@example.com`;
  const registrationEmail = String(process.env.SUPABASE_TEST_EMAIL || '').trim().toLowerCase();
  const password = `Initial-${random}-Password-2026`;
  const nextPassword = `Changed-${random}-Password-2026`;
  const legacyId = 900000000 + Math.floor(Math.random() * 90000000);
  const createdIds = [];
  const env = {
    SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey, SUPABASE_SECRET_KEY: secretKey,
    AUTH_COOKIE_SECRET: `stage-b-cookie-${random}-at-least-thirty-two-characters`,
    APP_ORIGIN: 'https://development.teachersinn.invalid', COOKIE_SECURE: '1',
  };
  const bridge = createSupabaseAuthBridge({ env, resolveLegacyUser(id, authEmail, mappedEmail, account) {
    if (id !== legacyId || authEmail !== email || mappedEmail !== email) return null;
    return { id: legacyId, email, name: 'Stage B Teacher', role: account.role, status: account.status };
  } });

  try {
    await t.test('registration creates safe profile and consent records', async () => {
      if (process.env.RUN_SUPABASE_EMAIL_INTEGRATION !== '1') {
        t.skip('Set RUN_SUPABASE_EMAIL_INTEGRATION=1 only after SMTP/quota and a disposable test inbox are ready.');
        return;
      }
      assert.match(registrationEmail, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'SUPABASE_TEST_EMAIL must be a dedicated disposable inbox.');
      const res = new Response();
      const result = await bridge.register({ email: registrationEmail, password, name: 'Registration Teacher', designation: 'Teacher', school: 'Test School', subjects: 'Science' }, res);
      assert.equal(result.ok, true);
      const listed = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
      assert.ifError(listed.error);
      const registrationUser = listed.data.users.find((user) => user.email === registrationEmail);
      assert.ok(registrationUser); createdIds.push(registrationUser.id);
      const profile = await service.from('profiles').select('name,designation,school,subjects').eq('id', registrationUser.id).single();
      assert.ifError(profile.error); assert.equal(profile.data.name, 'Registration Teacher');
      const settings = await service.from('account_settings').select('role,status,consent_at').eq('id', registrationUser.id).single();
      assert.ifError(settings.error); assert.equal(settings.data.role, 'educator'); assert.equal(settings.data.status, 'active'); assert.ok(settings.data.consent_at);
    });

    const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Stage B Teacher' } });
    assert.ifError(created.error); createdIds.push(created.data.user.id);
    const mapped = await service.from('legacy_user_map').insert({ legacy_user_id: legacyId, auth_user_id: created.data.user.id, normalized_email: email, migration_status: 'claimed' });
    assert.ifError(mapped.error);

    await t.test('one-time confirmation token is server-verified and cannot be reused', async () => {
      const link = await service.auth.admin.generateLink({ type: 'signup', email: confirmationEmail, password });
      assert.ifError(link.error); assert.ok(link.data.properties.hashed_token); createdIds.push(link.data.user.id);
      const response = new Response();
      const verified = await bridge.verifyOtp(link.data.properties.hashed_token, 'signup', response);
      assert.equal(verified.ok, true); assert.equal(verified.recovery, false);
      assert.match(response.getHeader('set-cookie'), /HttpOnly/);
      await assert.rejects(() => bridge.verifyOtp(link.data.properties.hashed_token, 'signup', new Response()), /invalid or expired/i);
    });

    let sessionResponse;
    await t.test('mapped login issues only a secure encrypted HttpOnly cookie', async () => {
      sessionResponse = new Response();
      assert.deepEqual(await bridge.login(email, password, sessionResponse), { ok: true });
      const cookie = sessionResponse.getHeader('set-cookie');
      assert.match(cookie, /^__Host-tin_sbauth=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/);
      assert.equal(cookie.includes(password), false); assert.equal(cookie.includes('access_token'), false);
      const loaded = await bridge.load(requestFrom(sessionResponse), new Response());
      assert.equal(loaded.user.id, legacyId); assert.equal(loaded.user.role, 'educator');
    });

    await t.test('expired access tokens refresh without exposing rotated tokens', async () => {
      const cookieValue = decodeURIComponent(sessionResponse.getHeader('set-cookie').split(';', 1)[0].split('=', 2)[1]);
      const payload = bridge._test.open(cookieValue); payload.expires_at = 0;
      const forced = bridge._test.seal(payload);
      const refreshedResponse = new Response();
      const loaded = await bridge.load({ headers: { cookie: `__Host-tin_sbauth=${forced}` } }, refreshedResponse);
      assert.equal(loaded.user.id, legacyId); assert.equal(loaded.csrf_token, payload.csrf_token); assert.match(refreshedResponse.getHeader('set-cookie'), /HttpOnly/);
      sessionResponse = refreshedResponse;
    });

    await t.test('administrator role is read from authoritative account settings', async () => {
      const promoted = await service.from('account_settings').update({ role: 'admin' }).eq('id', created.data.user.id);
      assert.ifError(promoted.error);
      const loaded = await bridge.load(requestFrom(sessionResponse), new Response());
      assert.equal(loaded.user.role, 'admin');
      const restored = await service.from('account_settings').update({ role: 'educator' }).eq('id', created.data.user.id);
      assert.ifError(restored.error);
    });

    await t.test('authoritative suspension immediately invalidates the server session', async () => {
      const suspended = await service.from('account_settings').update({ status: 'suspended' }).eq('id', created.data.user.id);
      assert.ifError(suspended.error);
      const response = new Response();
      assert.equal(await bridge.load(requestFrom(sessionResponse), response), null);
      assert.match(response.getHeader('set-cookie'), /Max-Age=0/);
      const active = await service.from('account_settings').update({ status: 'active' }).eq('id', created.data.user.id);
      assert.ifError(active.error);
    });

    await t.test('one-time recovery token resets the password and revokes sessions', async () => {
      const link = await service.auth.admin.generateLink({ type: 'recovery', email });
      assert.ifError(link.error); assert.ok(link.data.properties.hashed_token);
      const recoveryResponse = new Response();
      const verified = await bridge.verifyOtp(link.data.properties.hashed_token, 'recovery', recoveryResponse);
      assert.equal(verified.recovery, true);
      await assert.rejects(() => bridge.verifyOtp(link.data.properties.hashed_token, 'recovery', new Response()), /invalid or expired/i);
      const recoverySession = await bridge.load(requestFrom(recoveryResponse), new Response());
      assert.equal(recoverySession.purpose, 'recovery');
      const resetResponse = new Response();
      assert.deepEqual(await bridge.resetPassword(recoverySession, nextPassword, resetResponse), { ok: true });
      assert.match(resetResponse.getHeader('set-cookie'), /Max-Age=0/);
      const loginResponse = new Response();
      assert.deepEqual(await bridge.login(email, nextPassword, loginResponse), { ok: true });
      await bridge.logout(await bridge.load(requestFrom(loginResponse), new Response()), new Response());
    });
  } finally {
    await service.from('legacy_user_map').delete().eq('legacy_user_id', legacyId);
    for (const id of createdIds.reverse()) await service.auth.admin.deleteUser(id);
  }
});
