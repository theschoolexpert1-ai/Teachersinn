'use strict';

const { defineRepositoryContract } = require('../../data/repository-contract');
const { DatabaseError } = require('../errors');

const PROFILE_FIELDS = Object.freeze([
  'name', 'designation', 'school', 'subjects', 'grades', 'board', 'city', 'state', 'bio',
  'experience_years', 'open_to_mentor', 'directory_visible', 'avatar_path',
]);
const CAREER_FIELDS = Object.freeze([
  'professional_summary', 'previous_institutions', 'responsibilities', 'qualifications',
  'certifications', 'training', 'skills', 'specializations', 'cv_template',
]);
const PREFERENCE_FIELDS = Object.freeze([
  'messages', 'connections', 'community', 'workshops', 'learning', 'mentorship', 'support',
]);
const PROFILE_COLUMNS = Object.freeze(['id', ...PROFILE_FIELDS, 'created_at', 'updated_at']);
const PUBLIC_PROFILE = PROFILE_COLUMNS.join(',');
const QUALIFIED_PROFILE = PROFILE_COLUMNS.map((name) => `p.${name}`).join(',');
const userRepositoryContract = defineRepositoryContract('PostgreSQL user', [
  'getOwn', 'getPublicProfile', 'updateOwnProfile', 'initializeOwn', 'getOwnAccount',
]);
const careerRepositoryContract = defineRepositoryContract('PostgreSQL career profile', [
  'getOwn', 'initializeOwn', 'saveOwn',
]);
const preferenceRepositoryContract = defineRepositoryContract('PostgreSQL notification preferences', [
  'getOwn', 'initializeOwn', 'saveOwn',
]);
const adminUserRepositoryContract = defineRepositoryContract('PostgreSQL administrator users', [
  'list', 'detail', 'statistics', 'updateAccount',
]);

function ownId(identity) {
  return String(identity && identity.authUserId || '').trim();
}

function selected(fields, allowed) {
  return allowed.filter((name) => Object.prototype.hasOwnProperty.call(fields || {}, name));
}

function missing(message = 'The requested record was not found.') {
  return new DatabaseError(404, message, { code: 'NOT_FOUND' });
}

async function requireAdmin(db) {
  const row = await db.one('select public.is_admin() as authorized', []);
  if (!row.authorized) throw new DatabaseError(403, 'Administrator access is required.', { code: 'FORBIDDEN' });
}

function createPostgresUserRepository({ connection }) {
  if (!connection || typeof connection.withUserTransaction !== 'function') throw new TypeError('A PostgreSQL connection is required.');
  return userRepositoryContract.validate({
    async getOwn(identity) {
      return connection.withUserTransaction(identity, (db) => db.maybeOne(
        `select ${QUALIFIED_PROFILE}, a.role, a.status, a.consent_at, a.consent_version,
          a.last_login_at, a.created_at as account_created_at, a.updated_at as account_updated_at
         from public.profiles p join public.account_settings a on a.id=p.id
         where p.id=$1`, [ownId(identity)],
      ), { readOnly: true });
    },
    async getPublicProfile(identity, profileId) {
      return connection.withUserTransaction(identity, (db) => db.maybeOne(
        `select ${PUBLIC_PROFILE} from public.profiles where id=$1`, [profileId],
      ), { readOnly: true });
    },
    async updateOwnProfile(identity, fields) {
      const names = selected(fields, PROFILE_FIELDS);
      if (!names.length) throw new DatabaseError(400, 'No supported profile fields were provided.', { code: 'INVALID_INPUT' });
      const values = names.map((name) => fields[name]);
      return connection.withUserTransaction(identity, async (db) => {
        const row = await db.maybeOne(
          `update public.profiles set ${names.map((name, index) => `${name}=$${index + 1}`).join(',')}
           where id=$${names.length + 1} returning ${PUBLIC_PROFILE}`, [...values, ownId(identity)],
        );
        if (!row) throw missing('Profile not found.');
        return row;
      });
    },
    async initializeOwn(identity, fields = {}) {
      return connection.withUserTransaction(identity, async (db) => {
        const id = ownId(identity);
        let profile = await db.maybeOne(`select ${PUBLIC_PROFILE} from public.profiles where id=$1`, [id]);
        const account = await db.maybeOne(
          'select id,role,status,consent_at,consent_version,last_login_at,created_at,updated_at from public.account_settings where id=$1', [id],
        );
        if (!profile || !account) throw missing('Supabase Auth account initialization is incomplete.');
        if (fields.profile && Object.keys(fields.profile).length) {
          const names = selected(fields.profile, PROFILE_FIELDS);
          if (!names.length) throw new DatabaseError(400, 'No supported profile fields were provided.', { code: 'INVALID_INPUT' });
          profile = await db.one(
            `update public.profiles set ${names.map((name, index) => `${name}=$${index + 1}`).join(',')}
             where id=$${names.length + 1} returning ${PUBLIC_PROFILE}`,
            [...names.map((name) => fields.profile[name]), id],
          );
        }
        await db.execute('insert into public.career_profiles (user_id) values ($1) on conflict (user_id) do nothing', [id]);
        await db.execute('insert into public.notification_preferences (user_id) values ($1) on conflict (user_id) do nothing', [id]);
        return { id, initialized: true, profile };
      });
    },
    async getOwnAccount(identity) {
      return connection.withUserTransaction(identity, (db) => db.maybeOne(
        'select id,role,status,consent_at,consent_version,last_login_at,created_at,updated_at from public.account_settings where id=$1',
        [ownId(identity)],
      ), { readOnly: true });
    },
  });
}

function createPostgresCareerProfileRepository({ connection }) {
  if (!connection || typeof connection.withUserTransaction !== 'function') throw new TypeError('A PostgreSQL connection is required.');
  const columns = `user_id,${CAREER_FIELDS.join(',')},updated_at`;
  return careerRepositoryContract.validate({
    async getOwn(identity) {
      return connection.withUserTransaction(identity, (db) => db.maybeOne(
        `select ${columns} from public.career_profiles where user_id=$1`, [ownId(identity)],
      ), { readOnly: true });
    },
    async initializeOwn(identity) {
      return connection.withUserTransaction(identity, (db) => db.one(
        `insert into public.career_profiles (user_id) values ($1)
         on conflict (user_id) do update set user_id=excluded.user_id returning ${columns}`, [ownId(identity)],
      ));
    },
    async saveOwn(identity, fields) {
      const names = selected(fields, CAREER_FIELDS);
      if (!names.length) throw new DatabaseError(400, 'No supported career profile fields were provided.', { code: 'INVALID_INPUT' });
      const id = ownId(identity);
      return connection.withUserTransaction(identity, (db) => db.one(
        `insert into public.career_profiles (user_id,${names.join(',')})
         values ($1,${names.map((_, index) => `$${index + 2}`).join(',')})
         on conflict (user_id) do update set ${names.map((name) => `${name}=excluded.${name}`).join(',')}
         returning ${columns}`, [id, ...names.map((name) => fields[name])],
      ));
    },
  });
}

function createPostgresNotificationPreferenceRepository({ connection }) {
  if (!connection || typeof connection.withUserTransaction !== 'function') throw new TypeError('A PostgreSQL connection is required.');
  const columns = `user_id,${PREFERENCE_FIELDS.join(',')},updated_at`;
  const upsert = (db, identity, fields = {}) => {
    const names = selected(fields, PREFERENCE_FIELDS);
    const id = ownId(identity);
    if (!names.length) return db.one(
      `insert into public.notification_preferences (user_id) values ($1)
       on conflict (user_id) do update set user_id=excluded.user_id returning ${columns}`, [id],
    );
    return db.one(
      `insert into public.notification_preferences (user_id,${names.join(',')})
       values ($1,${names.map((_, index) => `$${index + 2}`).join(',')})
       on conflict (user_id) do update set ${names.map((name) => `${name}=excluded.${name}`).join(',')}
       returning ${columns}`, [id, ...names.map((name) => Boolean(fields[name]))],
    );
  };
  return preferenceRepositoryContract.validate({
    async getOwn(identity) {
      return connection.withUserTransaction(identity, (db) => db.maybeOne(
        `select ${columns} from public.notification_preferences where user_id=$1`, [ownId(identity)],
      ), { readOnly: true });
    },
    async initializeOwn(identity) { return connection.withUserTransaction(identity, (db) => upsert(db, identity)); },
    async saveOwn(identity, fields) {
      const unknown = Object.keys(fields || {}).filter((name) => !PREFERENCE_FIELDS.includes(name));
      if (unknown.length) throw new DatabaseError(400, 'Unsupported notification preference.', { code: 'INVALID_INPUT' });
      if (!Object.keys(fields || {}).length) throw new DatabaseError(400, 'No notification preferences were provided.', { code: 'INVALID_INPUT' });
      return connection.withUserTransaction(identity, (db) => upsert(db, identity, fields));
    },
  });
}

function createPostgresAdminUserRepository({ connection }) {
  if (!connection || typeof connection.withUserTransaction !== 'function') throw new TypeError('A PostgreSQL connection is required.');
  return adminUserRepositoryContract.validate({
    async list(identity, filters = {}) {
      const q = String(filters.q || '').slice(0, 200);
      const role = ['educator', 'mentor', 'admin'].includes(filters.role) ? filters.role : '';
      const status = ['active', 'suspended'].includes(filters.status) ? filters.status : '';
      const recent = filters.recent === true;
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db);
        return db.many('select * from public.admin_list_users($1,$2,$3,$4)', [q, role, status, recent]);
      }, { readOnly: true });
    },
    async detail(identity, userId) {
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db);
        const row = await db.maybeOne('select * from public.admin_user_detail($1)', [userId]);
        if (!row) throw missing('User not found.');
        return row;
      }, { readOnly: true });
    },
    async statistics(identity) {
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db);
        return db.one(`select count(*)::integer as total,
          count(*) filter (where status='active')::integer as active,
          count(*) filter (where status='suspended')::integer as suspended,
          count(*) filter (where role='admin')::integer as administrators
          from public.account_settings`, []);
      }, { readOnly: true });
    },
    async updateAccount(identity, userId, changes) {
      const names = selected(changes, ['role', 'status']);
      if (!names.length) throw new DatabaseError(400, 'No supported account fields were provided.', { code: 'INVALID_INPUT' });
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db);
        if (userId === ownId(identity)) throw new DatabaseError(409, 'Administrators cannot change their own role or status.', { code: 'SELF_ADMIN_CHANGE' });
        const row = await db.maybeOne(
          `update public.account_settings set ${names.map((name, index) => `${name}=$${index + 1}`).join(',')}
           where id=$${names.length + 1} returning id,role,status,updated_at`,
          [...names.map((name) => changes[name]), userId],
        );
        if (!row) throw missing('User not found.');
        return row;
      });
    },
  });
}

module.exports = {
  PROFILE_FIELDS, CAREER_FIELDS, PREFERENCE_FIELDS,
  userRepositoryContract, careerRepositoryContract, preferenceRepositoryContract, adminUserRepositoryContract,
  createPostgresUserRepository, createPostgresCareerProfileRepository,
  createPostgresNotificationPreferenceRepository, createPostgresAdminUserRepository,
};
