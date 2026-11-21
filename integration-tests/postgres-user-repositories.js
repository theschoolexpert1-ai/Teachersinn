'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createPostgresConnection } = require('../backend/src/postgres/connection');
const {
  createPostgresUserRepository, createPostgresCareerProfileRepository,
  createPostgresNotificationPreferenceRepository, createPostgresAdminUserRepository,
} = require('../backend/src/postgres/repositories/user.repository');

const url = String(process.env.SUPABASE_TEST_URL || '').trim();
const secretKey = String(process.env.SUPABASE_TEST_SECRET_KEY || '').trim();
const ref = String(process.env.SUPABASE_TEST_PROJECT_REF || '').trim();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function requireEnvironment() {
  assert.equal(process.env.RUN_SUPABASE_INTEGRATION, '1');
  assert.equal(process.env.SUPABASE_TEST_ALLOW_REMOTE, '1');
  assert.equal(process.env.SUPABASE_TEST_ENVIRONMENT, 'development');
  assert.equal(ref, 'ivnmrhwxdawmzaakdhec');
  assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
  assert.ok(secretKey && process.env.SUPABASE_DB_URL);
  assert.ok(process.env.SUPABASE_DB_CA_CERT || process.env.SUPABASE_DB_CA_CERT_PATH);
}

test('Stage 3B repositories enforce ownership, administrator authorization and cleanup', async () => {
  requireEnvironment();
  const service = createClient(url, secretKey, clientOptions);
  const connection = createPostgresConnection({ env: { ...process.env, POSTGRES_POOL_MAX: '2' } });
  const users = [];
  const suffix = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
  async function make(label) {
    const created = await service.auth.admin.createUser({
      email: `stage3b-${label}-${suffix}@example.test`, password: `Stage3B!${crypto.randomBytes(12).toString('base64url')}`,
      email_confirm: true, user_metadata: { name: `Stage 3B ${label}` },
    });
    assert.ifError(created.error); users.push(created.data.user.id); return created.data.user.id;
  }
  try {
    const a = await make('teacher-a');
    const b = await make('teacher-b');
    const administrator = await make('administrator');
    const promoted = await service.from('account_settings').update({ role: 'admin' }).eq('id', administrator);
    assert.ifError(promoted.error);
    const hidden = await service.from('profiles').update({ directory_visible: false }).eq('id', b);
    assert.ifError(hidden.error);

    const identityA = { authUserId: a, verified: true };
    const identityB = { authUserId: b, verified: true };
    const adminIdentity = { authUserId: administrator, verified: true };
    const usersRepository = createPostgresUserRepository({ connection });
    const careers = createPostgresCareerProfileRepository({ connection });
    const preferences = createPostgresNotificationPreferenceRepository({ connection });
    const admins = createPostgresAdminUserRepository({ connection });

    const initialized = await usersRepository.initializeOwn(identityA, { profile: { name: 'Stage 3B Initial' } });
    assert.equal(initialized.id, a); assert.equal(initialized.initialized, true); assert.equal(initialized.profile.name, 'Stage 3B Initial');
    const profile = await usersRepository.updateOwnProfile(identityA, {
      name: 'Stage 3B Teacher A', designation: 'Educator', skills: 'not-a-profile-column', directory_visible: true,
    });
    assert.equal(profile.id, a); assert.equal(profile.name, 'Stage 3B Teacher A');
    const own = await usersRepository.getOwn(identityA);
    assert.equal(own.id, a); assert.equal(own.role, 'educator'); assert.equal(own.status, 'active');
    assert.equal(await usersRepository.getPublicProfile(identityA, b), null, 'private Teacher B must be hidden by RLS');

    const career = await careers.saveOwn(identityA, {
      professional_summary: 'Disposable Stage 3B profile', skills: 'Assessment', cv_template: 'classic',
    });
    assert.equal(career.user_id, a); assert.equal((await careers.getOwn(identityA)).skills, 'Assessment');
    const crossCareer = await connection.withUserTransaction(identityB, (db) => db.many(
      'select user_id from public.career_profiles where user_id=$1', [a],
    ), { readOnly: true });
    assert.deepEqual(crossCareer, []);
    const crossCareerWrite = await connection.withUserTransaction(identityB, (db) => db.execute(
      "update public.career_profiles set skills='forged' where user_id=$1", [a],
    ));
    assert.equal(crossCareerWrite, 0);

    const defaults = await preferences.getOwn(identityA);
    assert.equal(defaults.messages, true); assert.equal(defaults.support, true);
    const changed = await preferences.saveOwn(identityA, { messages: false, workshops: false });
    assert.equal(changed.messages, false); assert.equal(changed.workshops, false);
    const crossPreferences = await connection.withUserTransaction(identityB, (db) => db.many(
      'select user_id from public.notification_preferences where user_id=$1', [a],
    ), { readOnly: true });
    assert.deepEqual(crossPreferences, []);

    await assert.rejects(() => admins.list(identityA), (error) => error.status === 403);
    await assert.rejects(() => admins.updateAccount(identityA, a, { role: 'admin' }), (error) => error.status === 403);
    const listed = await admins.list(adminIdentity, { q: 'Stage 3B Teacher A' });
    assert.equal(listed.some((row) => row.id === a), true);
    const detail = await admins.detail(adminIdentity, a);
    assert.equal(detail.id, a); assert.match(detail.email, /^stage3b-teacher-a-/);
    const stats = await admins.statistics(adminIdentity);
    assert.ok(stats.total >= 3); assert.ok(stats.administrators >= 1);
    assert.equal((await admins.updateAccount(adminIdentity, b, { status: 'suspended' })).status, 'suspended');
    assert.equal((await usersRepository.getOwnAccount(identityB)).status, 'suspended');
    await admins.updateAccount(adminIdentity, b, { status: 'active' });

    await assert.rejects(() => connection.withUserTransaction(identityA, async (db) => {
      await db.execute("update public.profiles set bio='must roll back' where id=$1", [a]);
      throw new Error('forced Stage 3B rollback');
    }), /forced Stage 3B rollback/);
    assert.notEqual((await usersRepository.getOwn(identityA)).bio, 'must roll back');

    const concurrent = await Promise.all([
      preferences.saveOwn(identityA, { community: false }),
      preferences.saveOwn(identityA, { community: true }),
    ]);
    assert.equal(concurrent.length, 2);
    assert.equal(typeof (await preferences.getOwn(identityA)).community, 'boolean');
    assert.equal((await usersRepository.getOwn(identityB)).id, b, 'pooled identity must not leak from Teacher A');
  } finally {
    try { await connection.close(); } catch { /* Preserve the authoritative test failure. */ }
    for (const userId of users) {
      const removed = await service.auth.admin.deleteUser(userId);
      assert.ifError(removed.error);
    }
    const remainingProfiles = await service.from('profiles').select('*', { count: 'exact', head: true }).in('id', users);
    assert.ifError(remainingProfiles.error); assert.equal(remainingProfiles.count, 0);
    const remainingCareers = await service.from('career_profiles').select('*', { count: 'exact', head: true }).in('user_id', users);
    assert.ifError(remainingCareers.error); assert.equal(remainingCareers.count, 0);
    const remainingPreferences = await service.from('notification_preferences').select('*', { count: 'exact', head: true }).in('user_id', users);
    assert.ifError(remainingPreferences.error); assert.equal(remainingPreferences.count, 0);
  }
});
