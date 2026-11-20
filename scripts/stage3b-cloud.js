'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { postgresConfig } = require('../src/postgres/config');

const VERSION = '202611190003';
const NAME = 'admin_user_management';
const APPLY = process.argv.includes('--apply');

async function main() {
  const config = postgresConfig(process.env);
  const pool = new Pool({ connectionString: config.connectionString, ssl: config.ssl, max: 1, application_name: 'teachersinn-stage3b-validation' });
  try {
    const history = await pool.query('select version,name from supabase_migrations.schema_migrations order by version');
    const conflicts = await pool.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname=any($1::text[]) order by p.proname`,
      [['admin_list_users', 'admin_user_detail']],
    );
    const counts = await pool.query(`select
      (select count(*)::integer from auth.users) auth_users,
      (select count(*)::integer from public.profiles) profiles,
      (select count(*)::integer from public.career_profiles) career_profiles,
      (select count(*)::integer from public.notification_preferences) notification_preferences`);
    const tables = await pool.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    );
    const publicTableCounts = {};
    for (const row of tables.rows) {
      const identifier = row.tablename.replaceAll('"', '""');
      const result = await pool.query(`select count(*)::integer as count from public."${identifier}"`);
      publicTableCounts[row.tablename] = result.rows[0].count;
    }
    const managedCounts = await pool.query(`select
      (select count(*)::integer from storage.objects) storage_objects,
      (select count(*)::integer from storage.buckets) storage_buckets`);
    const security = await pool.query(`select
      (select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) public_tables_without_rls,
      (select count(*)::integer from pg_policies where schemaname='public') public_policies,
      (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname=any($1::text[])) stage3c_functions,
      (select count(*)::integer from pg_trigger t where not t.tgisinternal
        and t.tgname=any($2::text[])) stage3c_triggers`, [
      ['course_learning_stats','course_lesson_outline','complete_course_lesson','lock_course_for_enrollment'],
      ['enrollments_lock_course','lessons_protect_enrolled_curriculum'],
    ]);
    console.log(JSON.stringify({
      tlsVerified: config.ssl.rejectUnauthorized === true,
      migrations: history.rows,
      stage3bFunctionConflicts: conflicts.rows.map((row) => row.proname),
      counts: counts.rows[0], applyRequested: APPLY,
      publicTableCounts, ...managedCounts.rows[0],
      security: security.rows[0],
    }));
    if (!APPLY) return;
    if (history.rows.some((row) => row.version === VERSION)) throw new Error(`Migration ${VERSION} is already recorded.`);
    if (conflicts.rowCount) throw new Error('Stage 3B functions already exist without migration history.');
    const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', `${VERSION}_${NAME}.sql`), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query(
        'insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)',
        [VERSION, NAME, [sql]],
      );
      await client.query('commit');
    } catch (error) {
      try { await client.query('rollback'); } catch { /* Preserve the original error. */ }
      throw error;
    } finally {
      client.release();
    }
    console.log(JSON.stringify({ applied: VERSION, transaction: 'committed' }));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ code: String(error.code || ''), message: String(error.message || 'Stage 3B cloud operation failed.') }));
  process.exitCode = 1;
});
