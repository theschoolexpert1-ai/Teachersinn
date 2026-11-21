'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'teachersinn-backup-check-'));
  const sourceDir = path.join(root, 'source');
  const backupDir = path.join(root, 'backup');
  fs.mkdirSync(backupDir, { recursive: true });
  process.env.TEACHERSINN_DATA_DIR = sourceDir;
  process.env.DATA_BACKEND = 'sqlite';
  process.env.AUTH_BACKEND = 'legacy';
  process.env.ADMIN_EMAIL = 'backup-check@test.local';
  process.env.ADMIN_PASSWORD = 'BackupCheckPassword2026';

  let source;
  let restored;
  try {
    const data = require('../backend/src/db');
    source = data.db;
    require('../backend/src/seed').seedIfEmpty();
    const teacher = data.run(`INSERT INTO users
      (name,email,password_hash,designation,school,subjects,consent_at)
      VALUES (?,?,?,?,?,?,?)`, 'Backup Check Teacher', 'teacher.backup@test.local',
      require('../backend/src/security').hashPassword('TeacherBackup2026'), 'Teacher',
      'Recovery Test School', 'Science', new Date().toISOString());
    const teacherId = Number(teacher.lastInsertRowid);
    const courseId = Number(data.get('SELECT id FROM courses ORDER BY id LIMIT 1').id);
    data.run('INSERT INTO enrollments (user_id,course_id) VALUES (?,?)', teacherId, courseId);

    const expected = {
      users: Number(data.get('SELECT COUNT(*) n FROM users').n),
      courses: Number(data.get('SELECT COUNT(*) n FROM courses').n),
      enrollment: Number(data.get('SELECT COUNT(*) n FROM enrollments WHERE user_id=? AND course_id=?', teacherId, courseId).n),
    };
    const backupPath = path.join(backupDir, 'teachersinn-restored.db');
    const pages = await backup(source, backupPath);

    restored = new DatabaseSync(backupPath, { readOnly: true });
    const actual = {
      users: Number(restored.prepare('SELECT COUNT(*) n FROM users').get().n),
      courses: Number(restored.prepare('SELECT COUNT(*) n FROM courses').get().n),
      enrollment: Number(restored.prepare('SELECT COUNT(*) n FROM enrollments WHERE user_id=? AND course_id=?').get(teacherId, courseId).n),
      migrations: Number(restored.prepare('SELECT COUNT(*) n FROM schema_migrations').get().n),
    };
    const integrity = restored.prepare('PRAGMA integrity_check').get().integrity_check;
    const foreignKeyViolations = restored.prepare('PRAGMA foreign_key_check').all().length;
    const migrationStatus = require('../backend/src/migrations').inspectDatabase(restored);
    if (integrity !== 'ok' || foreignKeyViolations !== 0 || actual.users !== expected.users || actual.courses !== expected.courses
      || actual.enrollment !== expected.enrollment || actual.migrations !== require('../backend/src/migrations').migrations.length || migrationStatus.errors.length || migrationStatus.pending.length) {
      throw new Error(`Backup validation failed: ${JSON.stringify({ integrity, foreignKeyViolations, expected, actual })}`);
    }
    console.log(JSON.stringify({ ok: true, method: 'node:sqlite backup API', pages, integrity, foreignKeyViolations,
      migrationHistory: { currentVersion: migrationStatus.currentVersion, applied: actual.migrations, pending: 0 }, records: actual }, null, 2));
  } finally {
    try { restored?.close(); } catch { /* best effort */ }
    try { source?.close(); } catch { /* best effort */ }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
