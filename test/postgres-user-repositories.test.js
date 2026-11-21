'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPostgresUserRepository, createPostgresCareerProfileRepository,
  createPostgresNotificationPreferenceRepository, createPostgresAdminUserRepository,
} = require('../backend/src/postgres/repositories/user.repository');

const A = { authUserId: '123e4567-e89b-42d3-a456-426614174000', verified: true };
const B = '123e4567-e89b-42d3-a456-426614174001';

function harness(rows = []) {
  const calls = [];
  const db = {
    async many(sql, values) { calls.push({ kind: 'many', sql, values }); return rows.shift() || []; },
    async maybeOne(sql, values) { calls.push({ kind: 'maybeOne', sql, values }); return rows.shift() || null; },
    async one(sql, values) { calls.push({ kind: 'one', sql, values }); return rows.shift() || { authorized: true }; },
    async execute(sql, values) { calls.push({ kind: 'execute', sql, values }); return 1; },
  };
  const connection = {
    async withUserTransaction(identity, work, options) {
      calls.push({ kind: 'transaction', identity, options });
      return work(db);
    },
  };
  return { connection, calls };
}

test('user repository derives ownership from verified identity and uses parameterized fields', async () => {
  const h = harness([[{ id: A.authUserId }], { id: A.authUserId, name: 'Teacher A' }]);
  const repository = createPostgresUserRepository(h);
  await repository.getOwn(A);
  const updated = await repository.updateOwnProfile(A, { name: 'Teacher A', role: 'admin' });
  assert.equal(updated.name, 'Teacher A');
  const update = h.calls.find((call) => /update public\.profiles/.test(call.sql || ''));
  assert.match(update.sql, /name=\$1/); assert.doesNotMatch(update.sql, /role=/);
  assert.deepEqual(update.values, ['Teacher A', A.authUserId]);
  assert.equal(h.calls.filter((call) => call.kind === 'transaction').every((call) => call.identity === A), true);
});

test('career repository uses owner-only upserts and rejects empty mutations', async () => {
  const h = harness([{ user_id: A.authUserId, skills: 'Assessment' }]);
  const repository = createPostgresCareerProfileRepository(h);
  const row = await repository.saveOwn(A, { skills: 'Assessment', unsupported: 'ignored' });
  assert.equal(row.skills, 'Assessment');
  const query = h.calls.find((call) => call.kind === 'one');
  assert.match(query.sql, /on conflict \(user_id\) do update/); assert.deepEqual(query.values, [A.authUserId, 'Assessment']);
  await assert.rejects(() => repository.saveOwn(A, {}), (error) => error.status === 400);
});

test('notification preferences preserve defaults and validate their allowlist', async () => {
  const h = harness([{ user_id: A.authUserId, messages: true }, { user_id: A.authUserId, messages: false }]);
  const repository = createPostgresNotificationPreferenceRepository(h);
  assert.equal((await repository.initializeOwn(A)).messages, true);
  assert.equal((await repository.saveOwn(A, { messages: 0 })).messages, false);
  await assert.rejects(() => repository.saveOwn(A, { marketing: true }), (error) => error.status === 400);
});

test('administrator repository performs an authoritative database check before privileged work', async () => {
  const denied = harness([{ authorized: false }]);
  const repository = createPostgresAdminUserRepository(denied);
  await assert.rejects(() => repository.list(A), (error) => error.status === 403);
  assert.equal(denied.calls.some((call) => /admin_list_users/.test(call.sql || '')), false);

  const allowed = harness([{ authorized: true }, { id: B, role: 'educator', status: 'suspended' }]);
  const admin = createPostgresAdminUserRepository(allowed);
  const changed = await admin.updateAccount(A, B, { status: 'suspended', consent_version: 'forged' });
  assert.equal(changed.status, 'suspended');
  const update = allowed.calls.find((call) => /update public\.account_settings/.test(call.sql || ''));
  assert.match(update.sql, /status=\$1/); assert.doesNotMatch(update.sql, /consent_version=/);
  const self = harness([{ authorized: true }]);
  await assert.rejects(() => createPostgresAdminUserRepository(self).updateAccount(A, A.authUserId, { role: 'educator' }), (error) => error.code === 'SELF_ADMIN_CHANGE');
});
