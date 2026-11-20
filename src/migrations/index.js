'use strict';

const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const initial = require('./0001_initial_schema');
const attendance = require('./0002_workshop_attendance');
const queryIndexes = require('./0003_query_indexes');
const courseManagement = require('./0004_course_management');

const migrations = [initial, attendance, queryIndexes, courseManagement].map((migration) => Object.freeze({
  ...migration,
  checksum: crypto.createHash('sha256').update(JSON.stringify({
    version: migration.version,
    name: migration.name,
    sql: migration.sql.replace(/\r\n/g, '\n').trim(),
  })).digest('hex'),
}));

const HISTORY_SQL = `CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const REQUIRED_CHECKS = {
  users: ["rolein('educator','mentor','admin')", "statusin('active','suspended')"],
  workshops: ["modein('online','in-person','hybrid')"],
  workshop_regs: ["attendance_statusin('pending','attended','absent')"],
  connections: ["statusin('pending','accepted','declined')"],
  tickets: ["statusin('open','in_progress','resolved','closed')", "priorityin('low','normal','high')"],
  mentorships: ["statusin('requested','active','declined','completed')"],
  jobs: ["statusin('open','closed')"],
  career_profiles: ["cv_templatein('classic','modern')"],
  job_applications: ["status='applied'"],
  notification_preferences: ['messagesin(0,1)', 'connectionsin(0,1)', 'communityin(0,1)', 'workshopsin(0,1)', 'learningin(0,1)', 'mentorshipin(0,1)', 'supportin(0,1)'],
  courses: ["statusin('draft','published','archived')", 'estimated_minutes>=0'],
};

class MigrationError extends Error {
  constructor(message, details = []) { super(message); this.name = 'MigrationError'; this.details = details; }
}

function normalizeSql(sql) {
  return String(sql || '').toLowerCase().replace(/["`\[\]]/g, '').replace(/\s+/g, '').replace(/check\(/g, 'check(');
}

function validateDefinitions(list = migrations) {
  const errors = [];
  const seen = new Set();
  let previous = '';
  for (const migration of list) {
    if (!/^\d{4}$/.test(migration.version)) errors.push(`Invalid migration version: ${migration.version}`);
    if (seen.has(migration.version)) errors.push(`Duplicate migration version: ${migration.version}`);
    if (previous && migration.version <= previous) errors.push(`Migration ${migration.version} is out of order after ${previous}`);
    if (!migration.name || !migration.sql || !migration.checksum) errors.push(`Migration ${migration.version} is incomplete`);
    seen.add(migration.version); previous = migration.version;
  }
  if (errors.length) throw new MigrationError('Invalid migration definitions.', errors);
  return true;
}

function applicationTables(db) {
  return db.prepare(`SELECT name FROM sqlite_master WHERE type='table'
    AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations' ORDER BY name`).all().map((row) => row.name);
}

function tableSnapshot(db, table) {
  const quote = table.replace(/"/g, '""');
  const columns = db.prepare(`PRAGMA table_info("${quote}")`).all().map((column) => ({
    name: column.name, type: String(column.type).toUpperCase(), notnull: Number(column.notnull),
    default: column.dflt_value === null ? null : String(column.dflt_value), pk: Number(column.pk),
  }));
  const foreignKeys = db.prepare(`PRAGMA foreign_key_list("${quote}")`).all().map((fk) => ({
    table: fk.table, from: fk.from, to: fk.to, onUpdate: fk.on_update, onDelete: fk.on_delete,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const indexes = db.prepare(`PRAGMA index_list("${quote}")`).all().map((index) => ({
    name: index.origin === 'c' ? index.name : null,
    unique: Number(index.unique), origin: index.origin,
    columns: db.prepare(`PRAGMA index_xinfo("${String(index.name).replace(/"/g, '""')}")`).all()
      .filter((item) => Number(item.key) === 1)
      .map((item) => ({ name: item.name, collation: item.coll, descending: Number(item.desc) })),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql || '';
  return { columns, foreignKeys, indexes, sql: normalizeSql(sql) };
}

function snapshot(db) {
  return Object.fromEntries(applicationTables(db).map((table) => [table, tableSnapshot(db, table)]));
}

function expectedSnapshot(count) {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('PRAGMA foreign_keys=ON');
    for (const migration of migrations.slice(0, count)) db.exec(migration.sql);
    return snapshot(db);
  } finally { db.close(); }
}

const EXPECTED = [Object.freeze({})];
for (let count = 1; count <= migrations.length; count += 1) EXPECTED.push(expectedSnapshot(count));

function compareSchema(db, appliedCount) {
  const expected = EXPECTED[appliedCount];
  if (!expected) return [`Unsupported applied migration count: ${appliedCount}`];
  const actual = snapshot(db);
  const errors = [];
  const expectedTables = Object.keys(expected); const actualTables = Object.keys(actual);
  for (const table of expectedTables) if (!actual[table]) errors.push(`Missing required table: ${table}`);
  for (const table of actualTables) if (!expected[table]) errors.push(`Unexpected application table: ${table}`);
  for (const table of expectedTables.filter((name) => actual[name])) {
    for (const field of ['columns', 'foreignKeys', 'indexes']) {
      if (JSON.stringify(actual[table][field]) !== JSON.stringify(expected[table][field])) errors.push(`${table}: ${field} differ from migration ${migrations[appliedCount - 1]?.version || 'empty'}`);
    }
    if (appliedCount >= 1) {
      for (const check of REQUIRED_CHECKS[table] || []) {
        if (table === 'workshop_regs' && appliedCount < 2) continue;
        if (table === 'courses' && appliedCount < 4) continue;
        if (!actual[table].sql.includes(`check(${check})`)) errors.push(`${table}: missing critical CHECK constraint ${check}`);
      }
    }
  }
  return errors;
}

function historyExists(db) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'").get();
}

function validateHistoryTable(db) {
  if (!historyExists(db)) return [];
  const actual = db.prepare('PRAGMA table_info(schema_migrations)').all().map((column) => ({
    name: column.name, type: String(column.type).toUpperCase(), notnull: Number(column.notnull), pk: Number(column.pk),
  }));
  const expected = [
    { name: 'version', type: 'TEXT', notnull: 0, pk: 1 },
    { name: 'name', type: 'TEXT', notnull: 1, pk: 0 },
    { name: 'checksum', type: 'TEXT', notnull: 1, pk: 0 },
    { name: 'applied_at', type: 'TEXT', notnull: 1, pk: 0 },
  ];
  return JSON.stringify(actual) === JSON.stringify(expected) ? [] : ['schema_migrations table definition is invalid.'];
}

function readHistory(db) {
  if (!historyExists(db)) return [];
  return db.prepare('SELECT version,name,checksum,applied_at FROM schema_migrations ORDER BY version').all();
}

function validateHistory(rows) {
  const errors = [];
  if (rows.length > migrations.length) errors.push('Migration history contains more entries than this application knows.');
  rows.forEach((row, index) => {
    const expected = migrations[index];
    if (!expected) return;
    if (row.version !== expected.version) errors.push(`Unexpected migration version ${row.version}; expected ${expected.version}.`);
    if (row.name !== expected.name) errors.push(`Migration ${row.version} name mismatch.`);
    if (row.checksum !== expected.checksum) errors.push(`Migration ${row.version} checksum mismatch; applied migrations are immutable.`);
  });
  return errors;
}

function recognizeUntrackedSchema(db) {
  const tables = applicationTables(db);
  if (!tables.length) return { state: 'empty', appliedCount: 0, errors: [] };
  const allErrors = [];
  for (let count = migrations.length; count >= 1; count -= 1) {
    const errors = compareSchema(db, count);
    if (!errors.length) return { state: count === migrations.length ? 'current-compatible' : 'legacy-compatible', appliedCount: count, errors: [] };
    allErrors.push(...errors);
  }
  return { state: 'incompatible', appliedCount: null, errors: [...new Set(allErrors)] };
}

function inspectDatabase(db) {
  validateDefinitions();
  if (!historyExists(db)) {
    const recognized = recognizeUntrackedSchema(db);
    return {
      historyPresent: false, compatibility: recognized.state,
      currentVersion: recognized.appliedCount ? migrations[recognized.appliedCount - 1].version : null,
      applied: [], pending: recognized.appliedCount === null ? [] : migrations.slice(recognized.appliedCount),
      checksumValid: null, schemaValid: recognized.errors.length === 0, errors: recognized.errors,
    };
  }
  const tableErrors = validateHistoryTable(db);
  if (tableErrors.length) return {
    historyPresent: true, compatibility: 'invalid', currentVersion: null, applied: [], pending: [],
    checksumValid: false, schemaValid: false, errors: tableErrors,
  };
  const applied = readHistory(db); const historyErrors = validateHistory(applied);
  const schemaErrors = compareSchema(db, applied.length);
  return {
    historyPresent: true, compatibility: historyErrors.length || schemaErrors.length ? 'invalid' : 'tracked',
    currentVersion: applied.at(-1)?.version || null, applied,
    pending: historyErrors.length ? [] : migrations.slice(applied.length),
    checksumValid: historyErrors.every((error) => !error.includes('checksum')),
    schemaValid: schemaErrors.length === 0, errors: [...historyErrors, ...schemaErrors],
  };
}

function recordMigration(db, migration) {
  db.prepare('INSERT INTO schema_migrations (version,name,checksum) VALUES (?,?,?)')
    .run(migration.version, migration.name, migration.checksum);
}

function migrateDatabase(db) {
  validateDefinitions();
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; BEGIN IMMEDIATE');
  const appliedNow = []; let adopted = false;
  try {
    if (!historyExists(db)) {
      const recognized = recognizeUntrackedSchema(db);
      if (recognized.state === 'incompatible') throw new MigrationError('Database schema is not a recognized TeachersInn version; no changes were made.', recognized.errors);
      db.exec(HISTORY_SQL);
      if (recognized.appliedCount) {
        for (const migration of migrations.slice(0, recognized.appliedCount)) recordMigration(db, migration);
        adopted = true;
      }
    }
    const tableErrors = validateHistoryTable(db);
    if (tableErrors.length) throw new MigrationError('Migration history table validation failed.', tableErrors);
    let rows = readHistory(db);
    const historyErrors = validateHistory(rows);
    if (historyErrors.length) throw new MigrationError('Migration history validation failed.', historyErrors);
    const currentErrors = compareSchema(db, rows.length);
    if (currentErrors.length) throw new MigrationError('Schema drift detected before migration.', currentErrors);
    for (const migration of migrations.slice(rows.length)) {
      db.exec(migration.sql);
      recordMigration(db, migration);
      appliedNow.push(migration.version);
    }
    const finalErrors = compareSchema(db, migrations.length);
    if (finalErrors.length) throw new MigrationError('Schema validation failed after migration.', finalErrors);
    db.exec('COMMIT');
    return { adopted, appliedNow, currentVersion: migrations.at(-1).version };
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* Preserve the original migration error. */ }
    throw error;
  }
}

module.exports = {
  migrations, MigrationError, HISTORY_SQL, validateDefinitions, applicationTables,
  compareSchema, inspectDatabase, migrateDatabase, readHistory,
};
