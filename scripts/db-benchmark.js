'use strict';

const { DatabaseSync } = require('node:sqlite');
const { performance } = require('node:perf_hooks');
const { migrations } = require('../backend/src/migrations');

const operations = [
  ['notifications', 'SELECT id,text FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 20', [1]],
  ['message inbox', `SELECT CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END other_id,MAX(id) mid
    FROM messages WHERE sender_id=? OR recipient_id=? GROUP BY other_id ORDER BY mid DESC`, [1, 1, 1]],
  ['community posts', 'SELECT id,title FROM posts WHERE community_id=? ORDER BY id DESC LIMIT 100', [1]],
  ['discussion replies', 'SELECT id,body FROM replies WHERE post_id=? ORDER BY id', [1]],
  ['workshop registrations', 'SELECT user_id FROM workshop_regs WHERE workshop_id=? AND attendance_status=?', [1, 'pending']],
  ['job application count', 'SELECT COUNT(*) n FROM job_applications WHERE job_id=?', [1]],
  ['upcoming lesson plans', "SELECT id,title FROM lesson_plans WHERE user_id=? AND plan_date>=date('now') ORDER BY plan_date,id DESC LIMIT 20", [1]],
  ['support tickets', 'SELECT id,subject FROM tickets WHERE user_id=? ORDER BY updated_at DESC,id DESC LIMIT 100', [1]],
  ['course lessons', 'SELECT id,title FROM lessons WHERE course_id=? ORDER BY position', [1]],
  ['course enrollment count', 'SELECT COUNT(*) n FROM enrollments WHERE course_id=?', [1]],
  ['user audit history', 'SELECT action,created_at FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 500', [1]],
];

function populate(db) {
  db.exec('PRAGMA synchronous=OFF; BEGIN');
  try {
    const user = db.prepare("INSERT INTO users (name,email,password_hash,consent_at) VALUES (?,?,?,datetime('now'))");
    for (let i = 1; i <= 300; i += 1) user.run(`Teacher ${i}`, `teacher${i}@test.local`, 'benchmark');
    const course = db.prepare("INSERT INTO courses (title,category,summary,instructor) VALUES (?,'Testing','Synthetic benchmark course','Benchmark')");
    for (let i = 1; i <= 100; i += 1) course.run(`Course ${i}`);
    const lesson = db.prepare("INSERT INTO lessons (course_id,position,title,body) VALUES (?,?,?,'Benchmark lesson body')");
    for (let courseId = 1; courseId <= 100; courseId += 1) for (let position = 1; position <= 20; position += 1) lesson.run(courseId, position, `Lesson ${position}`);
    const enrollment = db.prepare('INSERT INTO enrollments (user_id,course_id) VALUES (?,?)');
    for (let userId = 1; userId <= 300; userId += 1) for (let n = 0; n < 10; n += 1) enrollment.run(userId, ((userId + n) % 100) + 1);
    const workshop = db.prepare("INSERT INTO workshops (title,description,facilitator,starts_at) VALUES (?,'Benchmark workshop description','Benchmark','2030-01-01')");
    for (let i = 1; i <= 50; i += 1) workshop.run(`Workshop ${i}`);
    const registration = db.prepare('INSERT INTO workshop_regs (user_id,workshop_id,attendance_status) VALUES (?,?,?)');
    for (let userId = 1; userId <= 300; userId += 1) for (let n = 0; n < 10; n += 1) registration.run(userId, ((userId + n) % 50) + 1, n % 3 ? 'pending' : 'attended');
    const message = db.prepare('INSERT INTO messages (sender_id,recipient_id,body) VALUES (?,?,?)');
    for (let i = 1; i <= 10000; i += 1) { const sender = (i % 300) + 1; let recipient = ((i * 7 + 1) % 300) + 1; if (recipient === sender) recipient = recipient % 300 + 1; message.run(sender, recipient, `Message ${i}`); }
    const community = db.prepare("INSERT INTO communities (name,description) VALUES (?,'Benchmark community')");
    for (let i = 1; i <= 8; i += 1) community.run(`Community ${i}`);
    const post = db.prepare("INSERT INTO posts (community_id,user_id,title,body) VALUES (?,?,?,'Benchmark discussion body')");
    for (let i = 1; i <= 3000; i += 1) post.run((i % 8) + 1, (i % 300) + 1, `Discussion ${i}`);
    const reply = db.prepare("INSERT INTO replies (post_id,user_id,body) VALUES (?,?,?)");
    for (let i = 1; i <= 6000; i += 1) reply.run((i % 3000) + 1, (i % 300) + 1, `Reply ${i}`);
    const job = db.prepare("INSERT INTO jobs (title,school,city,description,apply_email) VALUES (?,'School','City','Benchmark job description','jobs@test.local')");
    for (let i = 1; i <= 100; i += 1) job.run(`Job ${i}`);
    const application = db.prepare('INSERT INTO job_applications (user_id,job_id) VALUES (?,?)');
    for (let userId = 1; userId <= 300; userId += 1) for (let n = 0; n < 10; n += 1) application.run(userId, ((userId + n) % 100) + 1);
    const notification = db.prepare('INSERT INTO notifications (user_id,text,created_at) VALUES (?,?,datetime(\'now\',?))');
    for (let i = 1; i <= 20000; i += 1) notification.run((i % 5) + 1, `Notification ${i}`, `-${i} seconds`);
    const plan = db.prepare("INSERT INTO lesson_plans (user_id,title,plan_date) VALUES (?,?,?)");
    for (let i = 1; i <= 3000; i += 1) plan.run((i % 30) + 1, `Plan ${i}`, `2030-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`);
    const ticket = db.prepare("INSERT INTO tickets (user_id,category,subject,body,updated_at) VALUES (?,'Other',?,'Benchmark ticket body',datetime('now',?))");
    for (let i = 1; i <= 3000; i += 1) ticket.run((i % 30) + 1, `Ticket ${i}`, `-${i} seconds`);
    const audit = db.prepare("INSERT INTO audit_log (user_id,action,detail) VALUES (?,'benchmark','')");
    for (let i = 1; i <= 10000; i += 1) audit.run((i % 30) + 1);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function percentile(sorted, fraction) { return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]; }

function measure(db) {
  return operations.map(([name, sql, params]) => {
    const statement = db.prepare(sql); const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => row.detail);
    for (let i = 0; i < 20; i += 1) statement.all(...params);
    const samples = [];
    for (let i = 0; i < 250; i += 1) { const start = performance.now(); statement.all(...params); samples.push(performance.now() - start); }
    samples.sort((a, b) => a - b);
    return { name, averageMs: +(samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(4),
      medianMs: +percentile(samples, .5).toFixed(4), p95Ms: +percentile(samples, .95).toFixed(4), plan };
  });
}

function database(migrationCount) {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  for (const migration of migrations.slice(0, migrationCount)) db.exec(migration.sql);
  populate(db); return db;
}

const beforeDb = database(2); const afterDb = database(migrations.length);
try {
  const before = measure(beforeDb); const after = measure(afterDb);
  const report = before.map((item, index) => ({ operation: item.name, before: item, after: after[index],
    averageChangePercent: +(((after[index].averageMs - item.averageMs) / item.averageMs) * 100).toFixed(1) }));
  console.log(JSON.stringify({ environment: { node: process.version, database: 'in-memory disposable SQLite', repetitions: 250 }, report }, null, 2));
} finally { beforeDb.close(); afterDb.close(); }
