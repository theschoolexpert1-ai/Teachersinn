'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const migration = require('./migration/stage3i');

const STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', BLOCKED: 'BLOCKED', NOT_CONFIGURED: 'NOT_CONFIGURED' });
const REQUIRED_MIGRATIONS = 13;
const REQUIRED_SOURCE_TABLES = 26;
const REQUIRED_TARGET_TABLES = 26;

function result(status, summary, evidence = {}) { return { status, summary, evidence }; }
function present(env, name) { return Boolean(String(env[name] || '').trim()); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function readJson(file) {
  if (!file) return null;
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return { exists: false, file: resolved };
  try { return { exists: true, file: resolved, hash: sha256(resolved), data: JSON.parse(fs.readFileSync(resolved, 'utf8')) }; }
  catch { return { exists: true, file: resolved, invalid: true }; }
}
function approved(value) {
  const approvedAt = Date.parse(String(value?.approvedAt || ''));
  const expiresAt = Date.parse(String(value?.expiresAt || ''));
  return value?.approved === true && Boolean(String(value.approvedBy || '').trim())
    && Number.isFinite(approvedAt) && Number.isFinite(expiresAt) && approvedAt <= Date.now() && expiresAt > Date.now();
}

function inspectSqlite(file) {
  const resolved = path.resolve(file);
  if (!fs.existsSync(resolved)) return { exists: false, file: resolved };
  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    const integrity = db.prepare('pragma integrity_check').get().integrity_check;
    const foreignKeyViolations = db.prepare('pragma foreign_key_check').all().length;
    const tables = db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all().map(row => row.name);
    const users = tables.includes('users') ? Number(db.prepare('select count(*) n from users').get().n) : null;
    const duplicateNormalizedEmails = tables.includes('users')
      ? Number(db.prepare('select count(*) n from (select lower(trim(email)) from users group by lower(trim(email)) having count(*) > 1)').get().n) : null;
    return { exists: true, file: resolved, sha256: sha256(resolved), integrity, foreignKeyViolations, tables, users, duplicateNormalizedEmails };
  } finally { db.close(); }
}

function latestRehearsal(root) {
  const dir = path.join(root, '.private', 'stage3i-rehearsals');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.migration-report.json')).sort().reverse();
  for (const name of files) {
    try {
      const report = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      if (report.outcome === 'PASS') return { file: path.join(dir, name), report };
    } catch { /* malformed evidence is ignored and never treated as PASS */ }
  }
  return null;
}

function inspectFacts({ root = path.resolve(__dirname, '..'), database, backup, env = process.env } = {}) {
  const sourceFile = database || path.join(root, 'data', 'teachersinn.db');
  const source = inspectSqlite(sourceFile);
  let compatibility = null;
  if (source.exists) {
    try {
      const snapshot = migration.readSource(sourceFile);
      compatibility = { ok: true, sourceTables: Object.keys(snapshot.data).length, counts: snapshot.counts };
    } catch (error) { compatibility = { ok: false, code: error.code || 'SOURCE_INCOMPATIBLE', message: error.message }; }
  }
  const backupFile = backup || String(env.CUTOVER_BACKUP_PATH || '').trim();
  const backupState = backupFile ? inspectSqlite(backupFile) : null;
  const identityManifest = readJson(String(env.CUTOVER_IDENTITY_MANIFEST_PATH || '').trim());
  const storageInventory = readJson(String(env.CUTOVER_STORAGE_INVENTORY_PATH || '').trim());
  const approvals = readJson(String(env.CUTOVER_APPROVALS_PATH || '').trim());
  const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter(name => name.endsWith('.sql')).length;
  return { root, source, compatibility, backup: backupState, identityManifest, storageInventory, approvals, migrations, rehearsal: latestRehearsal(root) };
}

function validateIdentityManifest(manifest, expected) {
  if (!manifest) return { status: STATUS.NOT_CONFIGURED, summary: 'The private identity manifest is not configured.' };
  if (!manifest.exists || manifest.invalid || !Array.isArray(manifest.data?.identities)) return { status: STATUS.FAIL, summary: 'The identity manifest is missing or invalid.' };
  const rows = manifest.data.identities;
  const legacy = new Set(), emails = new Set(), auth = new Set();
  let admins = 0;
  for (const row of rows) {
    const legacyId = Number(row.legacy_user_id), email = String(row.normalized_email || '').trim().toLowerCase();
    const authId = String(row.auth_user_id || '').trim().toLowerCase(), role = String(row.approved_role || '').trim();
    if (!Number.isSafeInteger(legacyId) || legacyId < 1 || !email || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(authId)
      || !['educator', 'mentor', 'admin'].includes(role) || !['active', 'suspended'].includes(row.account_status)
      || row.emailOwnershipApproved !== true || !String(row.approvalReference || '').trim()) {
      return { status: STATUS.FAIL, summary: 'The identity manifest contains an incomplete or invalid mapping.' };
    }
    if (legacy.has(legacyId) || emails.has(email) || auth.has(authId)) return { status: STATUS.FAIL, summary: 'The identity manifest contains a duplicate legacy ID, normalized email, or Auth UUID.' };
    legacy.add(legacyId); emails.add(email); auth.add(authId);
    if (role === 'admin') { admins++; if (row.administratorApproved !== true) return { status: STATUS.FAIL, summary: 'An administrator identity lacks explicit administrator approval.' }; }
  }
  if (rows.length !== expected) return { status: STATUS.FAIL, summary: 'The identity manifest does not cover the complete source identity inventory.', evidence: { expected, actual: rows.length } };
  return { status: STATUS.PASS, summary: 'The manifest has complete, unique, ownership-approved identity mappings.', evidence: { identities: rows.length, administrators: admins, manifestHash: manifest.hash } };
}

function evaluateReadiness(facts, env = process.env) {
  const checks = {};
  const source = facts.source;
  const approvals = facts.approvals?.data || {};
  checks.sourceDatabaseIntegrity = !source.exists
    ? result(STATUS.FAIL, 'The source SQLite database is missing.')
    : source.integrity !== 'ok' || source.foreignKeyViolations !== 0
      ? result(STATUS.FAIL, 'SQLite integrity or foreign-key validation failed.', { integrity: source.integrity, foreignKeyViolations: source.foreignKeyViolations })
      : result(STATUS.PASS, 'SQLite passed read-only integrity and foreign-key checks.', { tables: source.tables.length, users: source.users });
  checks.sourceIdentityInventory = source.exists && source.users !== null && source.duplicateNormalizedEmails === 0
    ? result(STATUS.PASS, 'Legacy identities can enter reviewed mapping.', { identities: source.users, duplicateNormalizedEmails: 0 })
    : result(STATUS.FAIL, 'Legacy identity inventory is missing or contains duplicate normalized emails.');
  checks.migrationCompatibility = facts.compatibility?.ok && facts.compatibility.sourceTables === REQUIRED_SOURCE_TABLES
    ? result(STATUS.PASS, 'The source is compatible with the 26-table Stage 3I reader.', { sourceTables: facts.compatibility.sourceTables, targetTables: migration.TARGET_TABLES.length })
    : result(STATUS.FAIL, 'The Stage 3I source compatibility check failed.', { code: facts.compatibility?.code || 'NOT_RUN' });
  checks.localSchemaInventory = facts.migrations === REQUIRED_MIGRATIONS && migration.TARGET_TABLES.length === REQUIRED_TARGET_TABLES
    ? result(STATUS.PASS, 'Local migration and target-table inventories match the validated baseline.', { migrations: facts.migrations, targetTables: migration.TARGET_TABLES.length })
    : result(STATUS.FAIL, 'Local migration or target-table inventory differs from the validated baseline.', { migrations: facts.migrations, targetTables: migration.TARGET_TABLES.length });
  const rehearsal = facts.rehearsal?.report;
  checks.cloudSchemaEvidence = rehearsal?.outcome === 'PASS' && rehearsal?.checks?.projectVerification?.status === 'PASS'
    && rehearsal?.checks?.tlsVerification?.status === 'PASS' && rehearsal?.checks?.independentZeroResidualPostflight?.status === 'PASS'
    ? result(STATUS.PASS, 'The latest durable rehearsal proves project identity, verified TLS, and a clean postflight.', { runId: rehearsal.runId })
    : result(STATUS.BLOCKED, 'No complete durable cloud rehearsal evidence is available.');
  checks.verifiedBackup = !facts.backup
    ? result(STATUS.NOT_CONFIGURED, 'CUTOVER_BACKUP_PATH has not been supplied.')
    : !facts.backup.exists
      ? result(STATUS.FAIL, 'The configured backup does not exist.')
      : facts.backup.integrity === 'ok' && facts.backup.foreignKeyViolations === 0
        ? result(STATUS.PASS, 'The configured backup passes read-only integrity checks.', { tables: facts.backup.tables.length, users: facts.backup.users })
        : result(STATUS.FAIL, 'The configured backup failed integrity checks.');
  checks.productionSnapshotApproval = checks.verifiedBackup.status !== STATUS.PASS
    ? result(STATUS.NOT_CONFIGURED, 'A valid production snapshot must be selected before approval.')
    : approved(approvals.productionSnapshot) && approvals.productionSnapshot.sha256 === facts.backup.sha256
      ? result(STATUS.PASS, 'The selected snapshot is explicitly approved and fingerprint-bound.', { sha256: facts.backup.sha256 })
      : approvals.productionSnapshot ? result(STATUS.FAIL, 'Snapshot approval is incomplete or its fingerprint does not match.') : result(STATUS.NOT_CONFIGURED, 'Production snapshot approval is missing.');
  checks.backupRestoreApproval = checks.verifiedBackup.status !== STATUS.PASS
    ? result(STATUS.NOT_CONFIGURED, 'Restore approval requires a valid snapshot.')
    : approved(approvals.backupRestore) && approvals.backupRestore.restoredSha256 === facts.backup.sha256
      ? result(STATUS.PASS, 'An independent reviewer approved a fingerprint-matching restore.', { sha256: facts.backup.sha256 })
      : approvals.backupRestore ? result(STATUS.FAIL, 'Restore approval is incomplete or does not match the selected snapshot.') : result(STATUS.NOT_CONFIGURED, 'Independent restore approval is missing.');
  const identity = validateIdentityManifest(facts.identityManifest, Number(source.users || 0));
  checks.identityManifestApproval = result(identity.status, identity.summary, identity.evidence);
  if (checks.identityManifestApproval.status === STATUS.PASS) {
    checks.identityManifestApproval = approved(approvals.identityManifest) && approvals.identityManifest.sha256 === facts.identityManifest.hash
      ? checks.identityManifestApproval
      : approvals.identityManifest ? result(STATUS.FAIL, 'Identity approval is incomplete or fingerprint-mismatched.') : result(STATUS.BLOCKED, 'The valid identity manifest lacks independent approval.');
  }
  checks.administratorMappingApproval = checks.identityManifestApproval.status !== STATUS.PASS
    ? result(STATUS.BLOCKED, 'Administrator mapping cannot pass before the complete identity manifest is approved.')
    : approved(approvals.administratorMapping)
      ? result(STATUS.PASS, 'Administrator mappings have separate explicit approval.')
      : result(STATUS.NOT_CONFIGURED, 'Separate administrator-mapping approval is missing.');
  const authVars = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'AUTH_COOKIE_SECRET', 'APP_ORIGIN'];
  const missingAuth = authVars.filter(name => !present(env, name));
  checks.authenticationPrerequisites = missingAuth.length
    ? result(STATUS.NOT_CONFIGURED, 'Supabase authentication prerequisites are incomplete.', { missing: missingAuth })
    : result(STATUS.PASS, 'Supabase authentication configuration prerequisites are present; activation remains separately gated.');
  const smtpVars = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'];
  const missingSmtp = smtpVars.filter(name => !present(env, name));
  const smtpEvidence = approvals.smtp || {};
  const smtpApproved = approved(smtpEvidence) && ['providerSelected','domainVerified','senderVerified','templatesApproved','deliveryTested','bounceHandling','rateLimitsReviewed','failureRecoveryTested'].every(key => smtpEvidence[key] === true);
  checks.smtpReadiness = missingSmtp.length
    ? result(STATUS.NOT_CONFIGURED, 'Transactional email is not fully configured or verified.', { missing: missingSmtp })
    : smtpApproved ? result(STATUS.PASS, 'Provider-neutral SMTP, sender, templates, delivery, bounce, limits, and recovery evidence are approved.')
      : result(STATUS.BLOCKED, 'SMTP values are present but complete approved delivery evidence is missing.');
  const storage = approvals.storage || {};
  checks.storageReadiness = !facts.storageInventory
    ? result(STATUS.NOT_CONFIGURED, 'The production Storage inventory is not configured.')
    : !facts.storageInventory.exists || facts.storageInventory.invalid
      ? result(STATUS.FAIL, 'The configured Storage inventory is missing or invalid.')
      : approved(storage) && storage.inventorySha256 === facts.storageInventory.hash
        && ['ownershipVerified','bucketPoliciesVerified','backupVerified','restoreVerified','missingObjectCheckPassed','rollbackReviewed'].every(key => storage[key] === true)
        ? result(STATUS.PASS, 'Storage inventory, ownership, policy, backup, restore, missing-object, and rollback evidence are approved.', { inventoryHash: facts.storageInventory.hash })
        : result(STATUS.BLOCKED, 'Storage inventory exists but complete fingerprint-bound approval evidence is missing.');
  const operationGate = (key, label) => approved(approvals.operations?.[key])
    ? result(STATUS.PASS, `${label} has a named owner and explicit approval.`)
    : result(STATUS.NOT_CONFIGURED, `${label} approval is missing.`);
  checks.maintenanceWindowApproval = operationGate('maintenanceWindow', 'The maintenance window');
  checks.writeFreezeReadiness = operationGate('writeFreeze', 'Write-freeze enforcement');
  checks.monitoringReadiness = operationGate('monitoring', 'Post-cutover monitoring');
  checks.rollbackAuthority = operationGate('rollbackAuthority', 'Rollback authority');
  const dataBackend = String(env.DATA_BACKEND || 'sqlite').toLowerCase();
  const authBackend = String(env.AUTH_BACKEND || 'legacy').toLowerCase();
  checks.currentRuntimeSafety = dataBackend === 'sqlite' && authBackend === 'legacy' && env.ENABLE_POSTGRES_RUNTIME !== '1'
    ? result(STATUS.PASS, 'The active runtime remains safely on SQLite and legacy authentication.', { dataBackend, authBackend, postgresRuntimeEnabled: false })
    : result(STATUS.FAIL, 'Runtime switches changed before cutover acceptance.', { dataBackend, authBackend, postgresRuntimeEnabled: env.ENABLE_POSTGRES_RUNTIME === '1' });
  const runtimeVars = ['SUPABASE_DB_URL','SUPABASE_DB_CA_CERT_PATH','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','AUTH_COOKIE_SECRET','APP_ORIGIN'];
  const missingRuntime = runtimeVars.filter(name => !present(env, name));
  checks.runtimeConfigurationReadiness = missingRuntime.length
    ? result(STATUS.NOT_CONFIGURED, 'Future runtime configuration is incomplete.', { missing: missingRuntime })
    : approved(approvals.runtimeConfiguration)
      ? result(STATUS.PASS, 'Future runtime configuration is present and independently approved; it remains inactive.')
      : result(STATUS.BLOCKED, 'Future runtime configuration is present but lacks explicit approval.');
  checks.rollbackPrerequisites = checks.backupRestoreApproval.status === STATUS.PASS && checks.writeFreezeReadiness.status === STATUS.PASS && checks.rollbackAuthority.status === STATUS.PASS
    ? result(STATUS.PASS, 'Backup restore, write freeze, and named rollback authority are approved.')
    : result(STATUS.NOT_CONFIGURED, 'Rollback approval requires a verified restore, write-freeze procedure, and named authority.');
  const gateKeys = ['productionSnapshotApproval','backupRestoreApproval','identityManifestApproval','administratorMappingApproval',
    'smtpReadiness','storageReadiness','maintenanceWindowApproval','writeFreezeReadiness','monitoringReadiness','rollbackAuthority',
    'localSchemaInventory','cloudSchemaEvidence','runtimeConfigurationReadiness'];
  checks.cutoverRuntime = gateKeys.every(key => checks[key].status === STATUS.PASS)
    ? result(STATUS.PASS, 'All readiness gates pass. Runtime activation is still a separate, explicitly authorized cutover action.')
    : result(STATUS.BLOCKED, 'Runtime activation remains blocked until every readiness gate passes and separate cutover authorization is granted.');
  const statuses = Object.values(checks).map(item => item.status);
  return { version: 1, readOnly: true, generatedAt: new Date().toISOString(), overall: statuses.includes(STATUS.FAIL) ? STATUS.FAIL : statuses.every(x => x === STATUS.PASS) ? STATUS.PASS : STATUS.BLOCKED, checks };
}

function main() {
  const arg = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
  const facts = inspectFacts({ database: arg('--db'), backup: arg('--backup') });
  const report = evaluateReadiness(facts);
  console.log(JSON.stringify(report, null, 2));
  if (report.overall === STATUS.FAIL) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { STATUS, sha256, readJson, inspectSqlite, latestRehearsal, inspectFacts, validateIdentityManifest, evaluateReadiness };
