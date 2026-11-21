'use strict';
/**
 * TeachersInn SQLite connection and query layer.
 * Schema changes are owned by backend/src/migrations and validated before this module
 * exposes the connection to the application.
 */
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { migrateDatabase } = require('./migrations');

// Resolve the local SQLite default from the application working directory.
// Besides matching the root data/ layout, this prevents serverless file tracers
// from treating a development database beside the source tree as application code.
const DATA_DIR = process.env.TEACHERSINN_DATA_DIR
  ? path.resolve(process.env.TEACHERSINN_DATA_DIR)
  : path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
const DB_PATH = path.join(DATA_DIR, 'teachersinn.db');

const db = new DatabaseSync(DB_PATH);
try {
  db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  migrateDatabase(db);
  try { fs.chmodSync(DB_PATH, 0o600); } catch { /* Best effort on platforms without POSIX modes. */ }
} catch (error) {
  try { db.close(); } catch { /* Preserve the initialization error. */ }
  throw error;
}

/** Run synchronous work atomically. Nested transactions are intentionally unsupported. */
function tx(fn) {
  if (db.isTransaction) throw new Error('Nested transactions are not supported; compose the operation inside its existing transaction.');
  db.exec('BEGIN');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

const statementCache = new Map();
function statement(sql) {
  let prepared = statementCache.get(sql);
  if (!prepared) { prepared = db.prepare(sql); statementCache.set(sql, prepared); }
  return prepared;
}
const all = (sql, ...params) => statement(sql).all(...params);
const get = (sql, ...params) => statement(sql).get(...params);
const run = (sql, ...params) => statement(sql).run(...params);

module.exports = { db, tx, all, get, run, DB_PATH, DATA_DIR };
