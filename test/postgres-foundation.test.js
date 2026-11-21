'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { postgresConfig } = require('../backend/src/postgres/config');
const { DatabaseError, mapDatabaseError } = require('../backend/src/postgres/errors');
const { createPostgresConnection } = require('../backend/src/postgres/connection');
const { defineRepositoryContract, invokeRepository } = require('../backend/src/data/repository-contract');

const env = {
  SUPABASE_DB_URL: 'postgresql://postgres.project:secret@db.example.test:5432/postgres',
  SUPABASE_DB_CA_CERT: '-----BEGIN CERTIFICATE-----\ntest-ca\n-----END CERTIFICATE-----',
  POSTGRES_POOL_MAX: '4', POSTGRES_STATEMENT_TIMEOUT_MS: '9000', POSTGRES_LOCK_TIMEOUT_MS: '2000',
};
const identity = { authUserId: '123e4567-e89b-42d3-a456-426614174000', verified: true };

test('PostgreSQL configuration is validated without opening a connection', () => {
  assert.throws(() => postgresConfig({}), /SUPABASE_DB_URL/);
  assert.throws(() => postgresConfig({ SUPABASE_DB_URL: 'https://example.test' }), /PostgreSQL protocol/);
  assert.throws(() => postgresConfig({ ...env, POSTGRES_POOL_MAX: 'unlimited' }), /integer/);
  const value = postgresConfig(env);
  assert.equal(value.max, 4); assert.equal(value.statementTimeoutMillis, 9000);
  assert.equal(value.ssl.rejectUnauthorized, true); assert.match(value.ssl.ca, /BEGIN CERTIFICATE/);
  assert.throws(() => postgresConfig({ SUPABASE_DB_URL: env.SUPABASE_DB_URL }), /CA_CERT/);
});

test('repository contracts accept existing sync and future async implementations', async () => {
  const contract = defineRepositoryContract('Example', ['find', 'save']);
  const sync = { find: (id) => ({ id }), save: () => ({ changes: 1 }) };
  assert.deepEqual(await invokeRepository(contract, sync, 'find', 7), { id: 7 });
  const asyncRepository = { find: async (id) => ({ id }), save: async () => ({ changes: 1 }) };
  assert.deepEqual(await invokeRepository(contract, asyncRepository, 'save'), { changes: 1 });
  assert.throws(() => contract.validate({ find() {} }), /missing: save/);
  await assert.rejects(() => invokeRepository(contract, sync, 'remove'), /not part/);
});

function mockPool({ failWork = false } = {}) {
  const calls = [];
  const client = {
    async query(input) {
      const text = typeof input === 'string' ? input : input.text;
      calls.push({ text, values: input.values || [] });
      if (text === 'select value from example' && failWork) throw Object.assign(new Error('duplicate'), { code: '23505' });
      if (text === 'select value from example') return { rows: [{ value: 1 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    release() { calls.push({ text: 'RELEASE', values: [] }); },
  };
  class MockPool {
    constructor(options) { this.options = options; MockPool.instances.push(this); }
    async connect() { calls.push({ text: 'CONNECT', values: [] }); return client; }
    async end() { calls.push({ text: 'END', values: [] }); }
  }
  MockPool.instances = [];
  return { MockPool, calls };
}

test('PostgreSQL pools are lazy and transactions establish local RLS identity before work', async () => {
  const { MockPool, calls } = mockPool();
  const connection = createPostgresConnection({ env, PoolClass: MockPool });
  assert.equal(MockPool.instances.length, 0);
  const result = await connection.withUserTransaction(identity, (db) => db.one('select value from example'));
  assert.deepEqual(result, { value: 1 });
  assert.equal(MockPool.instances.length, 1);
  const text = calls.map((call) => call.text).join('\n');
  assert.match(text, /^CONNECT\nBEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.match(text, /SET LOCAL ROLE authenticated/);
  assert.match(text, /request\.jwt\.claims/);
  assert.match(text, /select value from example\nCOMMIT\nRELEASE$/);
  const claimCall = calls.find((call) => call.text.includes('request.jwt.claims'));
  assert.equal(JSON.parse(claimCall.values[0]).sub, identity.authUserId);
  assert.equal(JSON.parse(claimCall.values[0]).role, 'authenticated');
});

test('transaction failures roll back, release connections and map safe conflicts', async () => {
  const { MockPool, calls } = mockPool({ failWork: true });
  const connection = createPostgresConnection({ env, PoolClass: MockPool });
  await assert.rejects(() => connection.withUserTransaction(identity, (db) => db.one('select value from example')), (error) => {
    assert.equal(error.status, 409); assert.equal(error.code, '23505'); return true;
  });
  assert.deepEqual(calls.slice(-2).map((call) => call.text), ['ROLLBACK', 'RELEASE']);
});

test('invalid identities and isolation levels fail before pooled work', async () => {
  const { MockPool } = mockPool();
  const connection = createPostgresConnection({ env, PoolClass: MockPool });
  await assert.rejects(() => connection.withUserTransaction({ authUserId: 'legacy-42' }, async () => {}), /verified Supabase Auth user UUID/);
  await assert.rejects(() => connection.withUserTransaction({ authUserId: identity.authUserId }, async () => {}), /verified Supabase Auth user UUID/);
  await assert.rejects(() => connection.withUserTransaction(identity, async () => {}, { isolation: 'chaotic' }), /Unsupported/);
  assert.equal(MockPool.instances.length, 0);
});

test('database errors map to stable HTTP-safe contracts without exposing SQL details', () => {
  const unique = mapDatabaseError(Object.assign(new Error('duplicate key value violates secret constraint'), { code: '23505' }));
  assert.ok(unique instanceof DatabaseError); assert.equal(unique.status, 409); assert.equal(unique.message.includes('secret'), false);
  assert.equal(mapDatabaseError({ code: '42501' }).status, 403);
  assert.equal(mapDatabaseError({ code: '40001' }).retryable, true);
  assert.equal(mapDatabaseError({ code: '40P01' }).retryable, true);
  assert.equal(mapDatabaseError({ code: '57014' }).status, 503);
  assert.equal(mapDatabaseError({ code: '55000' }).status, 409);
  assert.equal(mapDatabaseError({ code: '08006' }).status, 503);
  const application = new Error('application bug');
  assert.equal(mapDatabaseError(application), application);
});

test('connection close is idempotent and prevents new pooled work', async () => {
  const { MockPool, calls } = mockPool();
  const connection = createPostgresConnection({ env, PoolClass: MockPool });
  await connection.withUserTransaction(identity, async () => 'ok', { readOnly: true, isolation: 'repeatable read' });
  await connection.close(); await connection.close();
  assert.equal(calls.filter((call) => call.text === 'END').length, 1);
  await assert.rejects(() => connection.withUserTransaction(identity, async () => 'late'), /closing/);
});
