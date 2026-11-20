'use strict';

const { Pool } = require('pg');
const { postgresConfig } = require('./config');
const { mapDatabaseError } = require('./errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISOLATION = new Map([
  ['read committed', 'READ COMMITTED'],
  ['repeatable read', 'REPEATABLE READ'],
  ['serializable', 'SERIALIZABLE'],
]);

function identityClaims(identity) {
  const authUserId = String(identity && identity.authUserId || '').trim();
  if (!UUID.test(authUserId) || identity.verified !== true) throw new Error('A verified Supabase Auth user UUID is required for PostgreSQL repository access.');
  return { authUserId, claims: JSON.stringify({ sub: authUserId, role: 'authenticated' }) };
}

function scopedClient(client) {
  const query = async (text, values = []) => {
    if (typeof text !== 'string' || !text.trim() || !Array.isArray(values)) throw new TypeError('Parameterized SQL text and values are required.');
    return client.query({ text, values });
  };
  return Object.freeze({
    query,
    async many(text, values) { return (await query(text, values)).rows; },
    async maybeOne(text, values) {
      const result = await query(text, values);
      if (result.rows.length > 1) throw new Error('Expected at most one database row.');
      return result.rows[0] || null;
    },
    async one(text, values) {
      const result = await query(text, values);
      if (result.rows.length !== 1) throw new Error('Expected exactly one database row.');
      return result.rows[0];
    },
    async execute(text, values) { return (await query(text, values)).rowCount; },
  });
}

function createPostgresConnection({ env = process.env, PoolClass = Pool } = {}) {
  const config = postgresConfig(env);
  let pool = null;
  let closing = null;
  let closed = false;
  const open = () => {
    if (closed || closing) throw new Error('PostgreSQL connection pool is closing or closed.');
    if (!pool) pool = new PoolClass({
      connectionString: config.connectionString,
      max: config.max,
      connectionTimeoutMillis: config.connectionTimeoutMillis,
      idleTimeoutMillis: config.idleTimeoutMillis,
      query_timeout: config.statementTimeoutMillis,
      ssl: config.ssl,
      application_name: 'teachersinn-repositories',
    });
    return pool;
  };

  async function withUserTransaction(identity, work, options = {}) {
    if (typeof work !== 'function') throw new TypeError('Transaction work must be a function.');
    const { authUserId, claims } = identityClaims(identity);
    const isolation = ISOLATION.get(String(options.isolation || 'read committed').toLowerCase());
    if (!isolation) throw new Error('Unsupported PostgreSQL transaction isolation level.');
    const readOnly = options.readOnly === true ? ' READ ONLY' : '';
    let client;
    let began = false;
    try {
      client = await open().connect();
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}${readOnly}`);
      began = true;
      await client.query(`SET LOCAL statement_timeout = '${config.statementTimeoutMillis}ms'`);
      await client.query(`SET LOCAL lock_timeout = '${config.lockTimeoutMillis}ms'`);
      await client.query('SET LOCAL ROLE authenticated');
      await client.query({
        text: `select set_config('request.jwt.claims', $1, true),
          set_config('request.jwt.sub', $2, true),
          set_config('request.jwt.role', 'authenticated', true)`,
        values: [claims, authUserId],
      });
      const result = await work(scopedClient(client));
      await client.query('COMMIT');
      began = false;
      return result;
    } catch (error) {
      if (client && began) {
        try { await client.query('ROLLBACK'); } catch { /* The original failure is authoritative. */ }
      }
      throw mapDatabaseError(error);
    } finally {
      if (client) client.release();
    }
  }

  async function withAnonymousTransaction(work, options = {}) {
    if (typeof work !== 'function') throw new TypeError('Transaction work must be a function.');
    const isolation = ISOLATION.get(String(options.isolation || 'read committed').toLowerCase());
    if (!isolation) throw new Error('Unsupported PostgreSQL transaction isolation level.');
    const readOnly = options.readOnly === true ? ' READ ONLY' : '';
    let client;
    let began = false;
    try {
      client = await open().connect();
      await client.query(`BEGIN ISOLATION LEVEL ${isolation}${readOnly}`);
      began = true;
      await client.query(`SET LOCAL statement_timeout = '${config.statementTimeoutMillis}ms'`);
      await client.query(`SET LOCAL lock_timeout = '${config.lockTimeoutMillis}ms'`);
      await client.query('SET LOCAL ROLE anon');
      const result = await work(scopedClient(client));
      await client.query('COMMIT');
      began = false;
      return result;
    } catch (error) {
      if (client && began) {
        try { await client.query('ROLLBACK'); } catch { /* The original failure is authoritative. */ }
      }
      throw mapDatabaseError(error);
    } finally {
      if (client) client.release();
    }
  }

  async function close() {
    closed = true;
    if (!pool) return;
    if (!closing) closing = pool.end().finally(() => { pool = null; });
    return closing;
  }

  return Object.freeze({ withUserTransaction, withAnonymousTransaction, close });
}

module.exports = { createPostgresConnection };
