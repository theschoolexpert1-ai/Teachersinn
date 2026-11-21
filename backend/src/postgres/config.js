'use strict';

const fs = require('node:fs');

function integer(name, value, { min, max, fallback }) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback;
  if (!/^\d+$/.test(String(value))) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return parsed;
}

function postgresConfig(env = process.env) {
  const connectionString = String(env.SUPABASE_DB_URL || '').trim();
  if (!connectionString) throw new Error('SUPABASE_DB_URL is required for PostgreSQL repositories.');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('SUPABASE_DB_URL must be a valid PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('SUPABASE_DB_URL must use the PostgreSQL protocol.');
  if (!url.hostname || !url.username || !url.password) throw new Error('SUPABASE_DB_URL must include a host and database credentials.');
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  let ca = String(env.SUPABASE_DB_CA_CERT || '').trim();
  const caPath = String(env.SUPABASE_DB_CA_CERT_PATH || '').trim();
  if (!ca && caPath) {
    try { ca = fs.readFileSync(caPath, 'utf8').trim(); }
    catch { throw new Error('SUPABASE_DB_CA_CERT_PATH could not be read.'); }
  }
  if (!local && !ca) throw new Error('SUPABASE_DB_CA_CERT or SUPABASE_DB_CA_CERT_PATH is required for verified PostgreSQL TLS.');
  if (ca && !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----$/.test(ca)) throw new Error('The Supabase database CA certificate is not valid PEM.');
  return Object.freeze({
    connectionString,
    max: integer('POSTGRES_POOL_MAX', env.POSTGRES_POOL_MAX, { min: 1, max: 20, fallback: 5 }),
    connectionTimeoutMillis: integer('POSTGRES_CONNECT_TIMEOUT_MS', env.POSTGRES_CONNECT_TIMEOUT_MS, { min: 1000, max: 30000, fallback: 10000 }),
    idleTimeoutMillis: integer('POSTGRES_IDLE_TIMEOUT_MS', env.POSTGRES_IDLE_TIMEOUT_MS, { min: 1000, max: 300000, fallback: 30000 }),
    statementTimeoutMillis: integer('POSTGRES_STATEMENT_TIMEOUT_MS', env.POSTGRES_STATEMENT_TIMEOUT_MS, { min: 1000, max: 60000, fallback: 15000 }),
    lockTimeoutMillis: integer('POSTGRES_LOCK_TIMEOUT_MS', env.POSTGRES_LOCK_TIMEOUT_MS, { min: 100, max: 30000, fallback: 5000 }),
    ssl: local ? false : { rejectUnauthorized: true, ca },
  });
}

module.exports = { postgresConfig };
