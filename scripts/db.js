'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { inspectDatabase, migrateDatabase, migrations } = require('../src/migrations');

function usage() {
  return 'Usage: node scripts/db.js <status|verify|migrate> --db <absolute-or-relative-path> [--confirm-existing]';
}

function parseArgs(argv) {
  const command = argv[0]; const dbIndex = argv.indexOf('--db');
  if (!['status', 'verify', 'migrate'].includes(command) || dbIndex < 0 || !argv[dbIndex + 1]) throw new Error(usage());
  return { command, dbPath: path.resolve(argv[dbIndex + 1]), confirmExisting: argv.includes('--confirm-existing') };
}

function concise(status) {
  return {
    database: status.database,
    historyPresent: status.historyPresent,
    compatibility: status.compatibility,
    currentVersion: status.currentVersion,
    expectedVersion: migrations.at(-1).version,
    applied: status.applied.map(({ version, name, checksum, applied_at: appliedAt }) => ({ version, name, checksum, appliedAt })),
    pending: status.pending.map(({ version, name, checksum }) => ({ version, name, checksum })),
    checksumValid: status.checksumValid,
    schemaValid: status.schemaValid,
    errors: status.errors,
  };
}

function openReadOnly(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error(`Database does not exist: ${dbPath}`);
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  return db;
}

function statusCommand(dbPath) {
  const db = openReadOnly(dbPath);
  try { return concise({ database: dbPath, ...inspectDatabase(db) }); }
  finally { db.close(); }
}

function verifyCommand(dbPath) {
  const db = openReadOnly(dbPath);
  try {
    const status = concise({ database: dbPath, ...inspectDatabase(db) });
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all().length;
    const foreignKeysEnabled = Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys) === 1;
    const ok = integrity === 'ok' && foreignKeyViolations === 0 && foreignKeysEnabled
      && status.historyPresent && status.checksumValid === true
      && status.schemaValid && status.errors.length === 0 && status.pending.length === 0;
    return { ...status, integrity, foreignKeyViolations, foreignKeysEnabled, ok };
  } finally { db.close(); }
}

function migrateCommand(dbPath, confirmExisting) {
  const exists = fs.existsSync(dbPath);
  if (exists && !confirmExisting) throw new Error('Refusing to migrate an existing database without --confirm-existing. Back up and verify the target first.');
  const parent = path.dirname(dbPath);
  if (!fs.existsSync(parent)) throw new Error(`Parent directory does not exist: ${parent}`);
  const db = new DatabaseSync(dbPath);
  try {
    db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    const result = migrateDatabase(db);
    return { database: dbPath, ...result, pending: inspectDatabase(db).pending.length };
  } finally { db.close(); }
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = args.command === 'status' ? statusCommand(args.dbPath)
    : args.command === 'verify' ? verifyCommand(args.dbPath)
      : migrateCommand(args.dbPath, args.confirmExisting);
  console.log(JSON.stringify(result, null, 2));
  if ((args.command === 'status' && result.errors.length) || (args.command === 'verify' && !result.ok)) process.exitCode = 1;
  return result;
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(error.message);
    if (error.details?.length) error.details.forEach((detail) => console.error(`- ${detail}`));
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, statusCommand, verifyCommand, migrateCommand, main };
