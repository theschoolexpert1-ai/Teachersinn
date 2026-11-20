'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createPostgresConnection } = require('../src/postgres/connection');

const url = String(process.env.SUPABASE_TEST_URL || '').trim();
const secretKey = String(process.env.SUPABASE_TEST_SECRET_KEY || '').trim();
const ref = String(process.env.SUPABASE_TEST_PROJECT_REF || '').trim();
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function requireEnvironment() {
  assert.equal(process.env.RUN_SUPABASE_INTEGRATION, '1');
  assert.equal(process.env.SUPABASE_TEST_ALLOW_REMOTE, '1');
  assert.equal(process.env.SUPABASE_TEST_ENVIRONMENT, 'development');
  assert.equal(new URL(url).hostname, `${ref}.supabase.co`);
  assert.ok(secretKey && process.env.SUPABASE_DB_URL);
}

test('direct PostgreSQL foundation preserves transaction-local RLS identity and rollback', async (t) => {
  requireEnvironment();
  if (!String(process.env.SUPABASE_DB_CA_CERT || '').trim() && !String(process.env.SUPABASE_DB_CA_CERT_PATH || '').trim()) {
    t.skip('Configure the project CA certificate to validate the direct PostgreSQL foundation with verified TLS.');
    return;
  }
  const service = createClient(url, secretKey, options);
  const connection = createPostgresConnection({ env: { ...process.env, POSTGRES_POOL_MAX: '1' } });
  const suffix = crypto.randomBytes(8).toString('hex');
  const users = [];
  try {
    for (const label of ['one', 'two']) {
      const created = await service.auth.admin.createUser({
        email: `stage-3a-${label}-${suffix}@example.invalid`, password: `Stage3A-${suffix}-Password-2026`,
        email_confirm: true, user_metadata: { name: `Stage 3A ${label}` },
      });
      assert.ifError(created.error); users.push(created.data.user);
    }
    const [one, two] = users;
    const identity = { authUserId: one.id, verified: true };
    const secondIdentity = { authUserId: two.id, verified: true };
    const privateProfile = await service.from('profiles').update({ directory_visible: false }).eq('id', two.id);
    assert.ifError(privateProfile.error);

    const visible = await connection.withUserTransaction(identity, (db) => db.many(
      'select id from public.profiles where id = any($1::uuid[]) order by id', [[one.id, two.id]],
    ), { readOnly: true });
    assert.deepEqual(visible.map((row) => row.id), [one.id], 'RLS must hide the other private profile');

    await assert.rejects(() => connection.withUserTransaction(identity, async (db) => {
      await db.execute('insert into public.notification_preferences (user_id, messages) values ($1, false)', [one.id]);
      throw new Error('force rollback');
    }), /force rollback/);
    const rolledBack = await service.from('notification_preferences').select('user_id').eq('user_id', one.id);
    assert.ifError(rolledBack.error); assert.deepEqual(rolledBack.data, []);

    const committed = await connection.withUserTransaction(identity, (db) => db.one(
      'insert into public.notification_preferences (user_id, messages) values ($1, false) returning user_id, messages', [one.id],
    ));
    assert.equal(committed.user_id, one.id); assert.equal(committed.messages, false);

    const secondRequest = await connection.withUserTransaction(secondIdentity, (db) => db.many(
      'select user_id from public.notification_preferences order by user_id', [],
    ), { readOnly: true });
    assert.deepEqual(secondRequest, [], 'the next request on the one-connection pool must not inherit Teacher A identity');
    const secondCommitted = await connection.withUserTransaction(secondIdentity, (db) => db.one(
      'insert into public.notification_preferences (user_id, messages) values ($1, true) returning user_id', [two.id],
    ));
    assert.equal(secondCommitted.user_id, two.id);
    const firstRequestAgain = await connection.withUserTransaction(identity, (db) => db.many(
      'select user_id from public.notification_preferences order by user_id', [],
    ), { readOnly: true });
    assert.deepEqual(firstRequestAgain.map((row) => row.user_id), [one.id]);
  } finally {
    try { await connection.close(); } catch { /* Preserve the test failure. */ }
    for (const user of users) await service.auth.admin.deleteUser(user.id);
  }
});
