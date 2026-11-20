'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const {
  migrations, MigrationError, validateDefinitions, applicationTables,
  inspectDatabase, migrateDatabase,
} = require('../src/migrations');
const { statusCommand, verifyCommand, migrateCommand } = require('../scripts/db');
const { hashPassword, verifyPassword, randomToken, sha256 } = require('../src/security');

function workspace() { return fs.mkdtempSync(path.join(os.tmpdir(), 'teachersinn-migration-test-')); }
function open(file) { const db = new DatabaseSync(file); db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000'); return db; }
function remove(root) { fs.rmSync(root, { recursive: true, force: true }); }
function applyDirect(db, count) { for (const migration of migrations.slice(0, count)) db.exec(migration.sql); }
function childInit(dataDir) {
  return new Promise((resolve) => {
    const code = "const d=require('./src/db'); console.log('ok'); d.db.close()";
    const child = spawn(process.execPath, ['--no-warnings', '-e', code], {
      cwd: path.join(__dirname, '..'), env: { ...process.env, TEACHERSINN_DATA_DIR: dataDir, DATA_BACKEND: 'sqlite', AUTH_BACKEND: 'legacy' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function childSeed(dataDir) {
  return new Promise((resolve) => {
    const code = "const d=require('./src/db'); require('./src/seed').seedIfEmpty(); d.db.close()";
    const child = spawn(process.execPath, ['--no-warnings', '-e', code], {
      cwd: path.join(__dirname, '..'), env: { ...process.env, TEACHERSINN_DATA_DIR: dataDir, DATA_BACKEND: 'sqlite', AUTH_BACKEND: 'legacy', ADMIN_EMAIL: 'seed-admin@test.local', ADMIN_PASSWORD: 'SeedPassword2026' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = ''; child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stderr }));
  });
}

test('migration definitions reject duplicates and unexpected ordering', () => {
  const base = { name: 'test', sql: 'SELECT 1', checksum: 'test' };
  assert.throws(() => validateDefinitions([{ ...base, version: '0001' }, { ...base, version: '0001' }]), /Invalid migration definitions/);
  assert.throws(() => validateDefinitions([{ ...base, version: '0002' }, { ...base, version: '0001' }]), /Invalid migration definitions/);
});

test('fresh initialization creates 25 application tables and records migrations once', () => {
  const root = workspace(); const file = path.join(root, 'fresh.db'); const db = open(file);
  try {
    const first = migrateDatabase(db); const second = migrateDatabase(db);
    assert.deepEqual(first.appliedNow, migrations.map((migration) => migration.version));
    assert.deepEqual(second.appliedNow, []);
    assert.equal(applicationTables(db).length, 25);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, migrations.length);
    assert.equal(inspectDatabase(db).errors.length, 0);
  } finally { db.close(); remove(root); }
});

test('migration 0003 installs evidence-backed indexes used by priority query plans', () => {
  const root = workspace(); const file = path.join(root, 'indexes.db'); const db = open(file);
  try {
    migrateDatabase(db);
    const required = ['idx_lessons_course_position','idx_enrollments_course_user','idx_workshop_regs_workshop_status_user',
      'idx_messages_recipient_id','idx_posts_community_id','idx_replies_post_id','idx_tickets_user_updated',
      'idx_lesson_plans_user_date','idx_job_applications_job_user','idx_notifications_user_created','idx_audit_user_id'];
    const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((row) => row.name));
    required.forEach((name) => assert.equal(indexes.has(name), true, name));
    const plans = [
      ['SELECT id FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20', [1], 'idx_notifications_user_created'],
      ['SELECT id FROM posts WHERE community_id=? ORDER BY id DESC LIMIT 100', [1], 'idx_posts_community_id'],
      ['SELECT id FROM replies WHERE post_id=? ORDER BY id', [1], 'idx_replies_post_id'],
      ['SELECT user_id FROM workshop_regs WHERE workshop_id=? AND attendance_status=?', [1,'pending'], 'idx_workshop_regs_workshop_status_user'],
      ['SELECT id FROM lesson_plans WHERE user_id=? AND plan_date>=date(\'now\') ORDER BY plan_date,id DESC LIMIT 20', [1], 'idx_lesson_plans_user_date'],
    ];
    for (const [sql, params, index] of plans) {
      const detail = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => row.detail).join(' ');
      assert.match(detail, new RegExp(index)); assert.doesNotMatch(detail, /USE TEMP B-TREE/);
    }
  } finally { db.close(); remove(root); }
});

test('recognized version 0002 database is adopted and upgraded without changing existing records', () => {
  const root = workspace(); const file = path.join(root, 'existing.db'); const db = open(file);
  try {
    applyDirect(db, 2);
    const passwordHash = hashPassword('PreservedPassword2026');
    db.prepare('INSERT INTO users (name,email,password_hash,consent_at) VALUES (?,?,?,?)').run('Existing Teacher', 'existing@test.local', passwordHash, new Date().toISOString());
    const before = fs.statSync(file).size; const result = migrateDatabase(db);
    assert.equal(result.adopted, true); assert.deepEqual(result.appliedNow, ['0003', '0004']);
    assert.equal(db.prepare('SELECT password_hash FROM users WHERE email=?').get('existing@test.local').password_hash, passwordHash);
    assert.equal(verifyPassword('PreservedPassword2026', passwordHash), true);
    assert.ok(fs.statSync(file).size >= before);
  } finally { db.close(); remove(root); }
});

test('legacy attendance schema is baselined and upgraded while preserving users and sessions', () => {
  const root = workspace(); const file = path.join(root, 'legacy.db'); const db = open(file);
  try {
    applyDirect(db, 1);
    const hash = hashPassword('LegacyPassword2026');
    const userId = Number(db.prepare('INSERT INTO users (name,email,password_hash,consent_at) VALUES (?,?,?,?)').run('Legacy Teacher', 'legacy@test.local', hash, new Date().toISOString()).lastInsertRowid);
    const token = randomToken(32); const now = Date.now();
    db.prepare('INSERT INTO sessions (token_hash,user_id,csrf_token,created_at,last_seen,expires_at) VALUES (?,?,?,?,?,?)').run(sha256(token), userId, randomToken(24), now, now, now + 60_000);
    const workshopId = Number(db.prepare(`INSERT INTO workshops (title,description,facilitator,starts_at) VALUES ('Legacy','Legacy workshop','Teacher','2030-01-01')`).run().lastInsertRowid);
    db.prepare('INSERT INTO workshop_regs (user_id,workshop_id,attended) VALUES (?,?,1)').run(userId, workshopId);
    const result = migrateDatabase(db);
    assert.equal(result.adopted, true); assert.deepEqual(result.appliedNow, ['0002', '0003', '0004']);
    assert.equal(db.prepare('SELECT attendance_status FROM workshop_regs').get().attendance_status, 'attended');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id=?').get(userId).n, 1);
    assert.equal(verifyPassword('LegacyPassword2026', db.prepare('SELECT password_hash FROM users WHERE id=?').get(userId).password_hash), true);
  } finally { db.close(); remove(root); }
});

test('unknown or drifted schemas fail closed without creating migration history', () => {
  const root = workspace(); const file = path.join(root, 'unknown.db'); const db = open(file);
  try {
    db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, unexpected TEXT)');
    assert.throws(() => migrateDatabase(db), MigrationError);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='schema_migrations'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='users'").get().n, 1);
  } finally { db.close(); remove(root); }
});

test('missing required tables are reported as incompatible drift', () => {
  const root = workspace(); const file = path.join(root, 'missing-table.db'); const db = open(file);
  try {
    migrateDatabase(db); db.exec('DROP TABLE communities');
    const status = inspectDatabase(db);
    assert.equal(status.schemaValid, false);
    assert.ok(status.errors.some((error) => error.includes('Missing required table: communities')));
    assert.throws(() => migrateDatabase(db), /Schema drift detected/);
  } finally { db.close(); remove(root); }
});

test('checksum tampering and missing required indexes are detected', () => {
  const root = workspace(); const file = path.join(root, 'drift.db'); const db = open(file);
  try {
    migrateDatabase(db);
    db.exec('DROP INDEX idx_messages_pair');
    assert.equal(inspectDatabase(db).schemaValid, false);
    assert.throws(() => migrateDatabase(db), /Schema drift detected/);
    db.exec('CREATE INDEX idx_messages_pair ON messages(sender_id, recipient_id)');
    db.prepare("UPDATE schema_migrations SET checksum='modified' WHERE version='0001'").run();
    const status = inspectDatabase(db);
    assert.equal(status.checksumValid, false);
    assert.throws(() => migrateDatabase(db), /history validation failed/i);
  } finally { db.close(); remove(root); }
});

test('invalid pending migration rolls back its schema and history changes', () => {
  const root = workspace(); const file = path.join(root, 'rollback.db'); const db = open(file);
  const invalid = Object.freeze({ version: '0005', name: 'invalid_test', sql: 'CREATE TABLE should_rollback (id INTEGER); THIS IS INVALID SQL;', checksum: 'invalid-test-checksum' });
  try {
    migrateDatabase(db); migrations.push(invalid);
    assert.throws(() => migrateDatabase(db));
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='should_rollback'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version='0005'").get().n, 0);
  } finally { if (migrations.at(-1) === invalid) migrations.pop(); db.close(); remove(root); }
});

test('two concurrent initializers produce one consistent migration history', async () => {
  const root = workspace();
  try {
    const [a, b] = await Promise.all([childInit(root), childInit(root)]);
    assert.equal(a.status, 0, a.stderr); assert.equal(b.status, 0, b.stderr);
    const db = open(path.join(root, 'teachersinn.db'));
    try {
      assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, migrations.length);
      assert.equal(applicationTables(db).length, 25);
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    } finally { db.close(); }
  } finally { remove(root); }
});

test('starter data remains duplicate-safe across repeated initialized starts', async () => {
  const root = workspace();
  try {
    const first = await childSeed(root); const second = await childSeed(root);
    assert.equal(first.status, 0, first.stderr); assert.equal(second.status, 0, second.stderr);
    const db = open(path.join(root, 'teachersinn.db'));
    try {
      assert.equal(db.prepare('SELECT COUNT(*) n FROM courses').get().n, 8);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM workshops').get().n, 6);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n, migrations.length);
    } finally { db.close(); }
  } finally { remove(root); }
});

test('status and verification are read-only and migration requires deliberate existing-target confirmation', () => {
  const root = workspace(); const file = path.join(root, 'commands.db'); const db = open(file);
  try { migrateDatabase(db); } finally { db.close(); }
  try {
    const before = fs.statSync(file).mtimeMs;
    assert.equal(statusCommand(file).pending.length, 0);
    assert.equal(verifyCommand(file).ok, true);
    assert.equal(fs.statSync(file).mtimeMs, before);
    assert.throws(() => migrateCommand(file, false), /--confirm-existing/);
    assert.equal(migrateCommand(file, true).pending, 0);
  } finally { remove(root); }
});

test('read-only verification refuses an untracked database without modifying it', () => {
  const root = workspace(); const file = path.join(root, 'untracked.db'); const db = open(file);
  try { applyDirect(db, migrations.length); } finally { db.close(); }
  try {
    const before = fs.statSync(file).mtimeMs;
    const status = statusCommand(file); const verification = verifyCommand(file);
    assert.equal(status.compatibility, 'current-compatible');
    assert.equal(status.historyPresent, false); assert.equal(verification.ok, false);
    assert.equal(fs.statSync(file).mtimeMs, before);
    const check = open(file);
    try { assert.equal(check.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='schema_migrations'").get().n, 0); }
    finally { check.close(); }
  } finally { remove(root); }
});
