'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { publicConfig, serverConfig } = require('../src/supabase/config');
const { createUserClient, createAdminClient } = require('../src/supabase/client');

const root = path.join(__dirname, '..');
const migrations = [
  '202611120001_initial_schema.sql',
  '202611120002_rls_policies.sql',
  '202611120003_storage.sql',
  '202611190001_schema_sync_course_management.sql',
  '202611190002_fix_course_rls_recursion.sql',
].map((name) => fs.readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8'));

test('Supabase configuration is explicit and keeps the secret server-only', () => {
  assert.throws(() => publicConfig({}), /SUPABASE_URL/);
  assert.throws(() => publicConfig({ SUPABASE_URL: 'http://example.com', SUPABASE_PUBLISHABLE_KEY: 'publishable' }), /HTTPS/);
  const env = {
    SUPABASE_URL: 'https://project.supabase.co/',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    SUPABASE_SECRET_KEY: 'secret-test-key',
  };
  assert.deepEqual(publicConfig(env), { url: 'https://project.supabase.co', publishableKey: 'publishable-test-key' });
  assert.equal(Object.hasOwn(publicConfig(env), 'secretKey'), false);
  assert.equal(serverConfig(env).secretKey, 'secret-test-key');
  assert.equal(fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8').includes('SUPABASE_SECRET_KEY'), false);
});

test('server clients disable browser-style session persistence', () => {
  const env = {
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'publishable-test-key',
    SUPABASE_SECRET_KEY: 'secret-test-key',
  };
  assert.throws(() => createUserClient('', env), /access token/i);
  const user = createUserClient('verified-access-token', env);
  const admin = createAdminClient(env);
  assert.equal(user.supabaseUrl, 'https://project.supabase.co');
  assert.equal(admin.supabaseUrl, 'https://project.supabase.co');
});

test('Supabase backend selection fails closed before the adapter cutover', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./src/data')"], {
    cwd: root,
    env: { ...process.env, DATA_BACKEND: 'supabase' },
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not enabled in Stage A/);
});

test('initial migration preserves all domains and uses UUID user relationships', () => {
  const sql = migrations[0];
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((match) => match[1]);
  const required = [
    'profiles','account_settings','legacy_user_map','audit_log','courses','lessons','enrollments',
    'lesson_progress','workshops','workshop_regs','connections','messages','communities','posts',
    'replies','tickets','ticket_replies','mentorships','tutorials','tutorial_views','lesson_plans',
    'jobs','notifications',
  ];
  assert.deepEqual(tables, required);
  assert.match(sql, /id uuid primary key references auth\.users/);
  assert.match(sql, /legacy_user_id bigint primary key/);
  assert.doesNotMatch(sql, /password_hash|create table public\.sessions/i);
  assert.match(sql, /certificate_code text unique/);
});

test('every application table has RLS and certificate verification is narrowly exposed', () => {
  const schema = migrations[0];
  const rls = migrations[1];
  const tables = [...schema.matchAll(/create table public\.(\w+)/g)].map((match) => match[1]);
  for (const table of tables) assert.match(rls, new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(rls, /create policy messages_read_participant/);
  assert.match(rls, /public\.can_message\(sender_id, recipient_id\)/);
  assert.match(rls, /create policy lesson_plans_own/);
  assert.match(rls, /grant execute on function public\.verify_certificate\(text\) to anon, authenticated/);
  assert.match(rls, /invalid mentorship transition/);
  assert.match(rls, /grant update \(read_at\) on public\.messages/);
  assert.match(rls, /grant update \(status, updated_at\) on public\.connections/);
  assert.match(rls, /grant update \(status, updated_at\) on public\.mentorships/);
  assert.doesNotMatch(rls, /grant select, update on public\.profiles/);
  assert.doesNotMatch(rls, /messages_read_participant[\s\S]{0,180}public\.is_admin/);
  assert.doesNotMatch(rls, /lesson_plans_own[\s\S]{0,180}public\.is_admin/);
  assert.match(rls, /grant select \(id, name,[\s\S]*?\)\s+on public\.profiles/);
  assert.match(rls, /grant update \(status, priority, updated_at\) on public\.tickets/);
});

test('Storage migration separates public avatars from private documents', () => {
  const sql = migrations[2];
  assert.match(sql, /'profile-photos', 'profile-photos', true/);
  assert.match(sql, /'professional-documents', 'professional-documents', false/);
  assert.match(sql, /professional_documents_read_own/);
  assert.match(sql, /owner_id = \(select auth\.uid\(\)\)::text/);
  assert.match(sql, /file_size_limit/);
  assert.match(sql, /allowed_mime_types/);
});

test('schema sync covers SQLite 0002 and 0004 domains with owner-scoped RLS', () => {
  const sql = migrations[3];
  for (const table of ['career_profiles', 'job_applications', 'notification_preferences']) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  for (const column of ['attendance_status', 'attendance_verified_at', 'attendance_verified_by']) {
    assert.match(sql, new RegExp(`workshop_regs add column ${column}`));
  }
  for (const column of ['description', 'thumbnail', 'objectives', 'prerequisites', 'estimated_minutes', 'status', 'updated_at']) {
    assert.match(sql, new RegExp(`courses add column ${column}`));
  }
  assert.match(sql, /status in \('draft','published','archived'\)/);
  assert.match(sql, /curriculum cannot change after enrollment/);
  assert.match(sql, /create policy career_profiles_own/);
  assert.match(sql, /create policy job_applications_read/);
  assert.match(sql, /create policy notification_preferences_own/);
  assert.match(sql, /e\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(sql, /grant update \(attended, attendance_status, attendance_verified_at, attendance_verified_by\)/);
  assert.doesNotMatch(sql, /drop table|drop column|delete from|truncate/i);
});

test('course visibility uses a narrow non-recursive enrollment predicate', () => {
  const sql = migrations[4];
  assert.match(sql, /create or replace function public\.is_enrolled_in_course/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.is_enrolled_in_course/);
  assert.match(sql, /public\.is_enrolled_in_course\(id, \(select auth\.uid\(\)\)\)/);
  assert.doesNotMatch(sql, /delete from|drop table|drop column|truncate/i);
});

test('Stage 3C learning migration keeps completion and curriculum integrity database-owned', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '202611190004_learning_repository_security.sql'), 'utf8');
  assert.match(sql, /complete_course_lesson/);
  assert.match(sql, /security definer/);
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /for update/);
  assert.match(sql, /enrollments_lock_course/);
  assert.match(sql, /grant execute on function public\.complete_course_lesson\(bigint\) to authenticated/);
  assert.doesNotMatch(sql, /grant .* on public\.enrollments to anon/i);
});

test('Stage 3D migration makes capacity and attendance database authoritative', () => {
  const sql=fs.readFileSync(path.join(root,'supabase','migrations','202611190005_workshops_jobs_security.sql'),'utf8');
  assert.match(sql,/register_for_workshop/);assert.match(sql,/for update/);assert.match(sql,/target\.capacity/);
  assert.match(sql,/set_workshop_attendance/);assert.match(sql,/public\.is_admin\(\)/);assert.match(sql,/attendance_verified_at/);
  assert.match(sql,/admin_workshop_registrations/);assert.match(sql,/revoke all/);
  assert.doesNotMatch(sql,/grant .* to anon|disable row level security|drop table|truncate/i);
});

test('Stage 3E migration preserves private domains and atomic notification workflows', () => {
  const sql = fs.readFileSync(path.join(root,'supabase','migrations','202611190007_community_network_security.sql'),'utf8');
  assert.match(sql, /connections_unordered_pair_uidx/i);
  assert.match(sql, /request_connection/); assert.match(sql, /respond_connection/);
  assert.match(sql, /send_private_message/); assert.match(sql, /create_community_reply/);
  assert.match(sql, /public\.is_admin\(\)/i);
  assert.doesNotMatch(sql, /grant\s+[^;]*\s+to\s+(?:anon|public|service_role)\b/i);
  assert.doesNotMatch(sql, /disable\s+row\s+level|drop\s+table|truncate\s+/i);
});

test('Stage 3F migration keeps remaining workflows narrow and transactional',()=>{const sql=fs.readFileSync(path.join(root,'supabase','migrations','202611190008_remaining_repository_security.sql'),'utf8');assert.match(sql,/mentorships_open_pair_uidx/);assert.match(sql,/request_mentorship/);assert.match(sql,/transition_mentorship/);assert.match(sql,/reply_support_ticket/);assert.match(sql,/admin_update_ticket/);assert.match(sql,/for update/);assert.match(sql,/public\.is_admin\(\)/);assert.doesNotMatch(sql,/drop\s+table|truncate\s+|disable\s+row\s+level/i);assert.doesNotMatch(sql,/grant\s+[^;]*\s+to\s+(?:anon|public|service_role)/i)});

test('environment example contains placeholders and SQLite remains the default', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.match(example, /DATA_BACKEND=sqlite/);
  assert.match(example, /SUPABASE_PUBLISHABLE_KEY=/);
  assert.match(example, /SUPABASE_SECRET_KEY=/);
  assert.doesNotMatch(example, /eyJ[A-Za-z0-9_-]{20,}/);
  const dataModule = fs.readFileSync(path.join(root, 'src', 'data', 'index.js'), 'utf8');
  assert.match(dataModule, /process\.env\.DATA_BACKEND \|\| 'sqlite'/);
});

test('cloud integration tests require an explicit development project identity', () => {
  const integration = fs.readFileSync(path.join(root, 'integration-tests', 'supabase.js'), 'utf8');
  assert.match(integration, /SUPABASE_TEST_ALLOW_REMOTE/);
  assert.match(integration, /SUPABASE_TEST_ENVIRONMENT/);
  assert.match(integration, /SUPABASE_TEST_PROJECT_REF/);
  assert.match(integration, /host, `\$\{projectRef\}\.supabase\.co`/);
});
