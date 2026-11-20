'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS, evaluateReadiness } = require('../scripts/cutover-readiness');

function facts(overrides = {}) {
  return {
    source: { exists: true, integrity: 'ok', foreignKeyViolations: 0, tables: Array(26).fill('table'), users: 12, duplicateNormalizedEmails: 0 },
    compatibility: { ok: true, sourceTables: 26 }, migrations: 13,
    rehearsal: { report: { outcome: 'PASS', runId: 'safe-run', checks: { projectVerification: { status: 'PASS' }, tlsVerification: { status: 'PASS' }, independentZeroResidualPostflight: { status: 'PASS' } } } },
    backup: { exists: true, integrity: 'ok', foreignKeyViolations: 0, tables: Array(26).fill('table'), users: 12 },
    ...overrides,
  };
}

const safeRuntime = { DATA_BACKEND: 'sqlite', AUTH_BACKEND: 'legacy' };

test('readiness is fail-closed while deferred activation prerequisites remain incomplete', () => {
  const report = evaluateReadiness(facts(), safeRuntime);
  assert.equal(report.readOnly, true);
  assert.equal(report.overall, STATUS.BLOCKED);
  assert.equal(report.checks.sourceDatabaseIntegrity.status, STATUS.PASS);
  assert.equal(report.checks.smtpReadiness.status, STATUS.NOT_CONFIGURED);
  assert.equal(report.checks.cutoverRuntime.status, STATUS.BLOCKED);
});

test('missing environment configuration is reported without exposing values', () => {
  const report = evaluateReadiness(facts(), safeRuntime);
  assert.deepEqual(report.checks.authenticationPrerequisites.evidence.missing,
    ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'AUTH_COOKIE_SECRET', 'APP_ORIGIN']);
  assert.equal(JSON.stringify(report).includes('password-value'), false);
});

test('missing and invalid backups cannot satisfy rollback readiness', () => {
  const missing = evaluateReadiness(facts({ backup: null }), safeRuntime);
  assert.equal(missing.checks.verifiedBackup.status, STATUS.NOT_CONFIGURED);
  assert.equal(missing.checks.rollbackPrerequisites.status, STATUS.NOT_CONFIGURED);
  const invalid = evaluateReadiness(facts({ backup: { exists: true, integrity: 'corrupt', foreignKeyViolations: 2, tables: [], users: null } }), safeRuntime);
  assert.equal(invalid.checks.verifiedBackup.status, STATUS.FAIL);
  assert.equal(invalid.overall, STATUS.FAIL);
});

test('schema mismatch and incompatible source fail readiness', () => {
  const report = evaluateReadiness(facts({ migrations: 12, compatibility: { ok: false, code: 'INVALID_FOREIGN_KEY' } }), safeRuntime);
  assert.equal(report.checks.localSchemaInventory.status, STATUS.FAIL);
  assert.equal(report.checks.migrationCompatibility.status, STATUS.FAIL);
});

test('identity transition, SMTP, and rollback stay blocked pending human acceptance', () => {
  const env = { ...safeRuntime, SUPABASE_URL: 'configured', SUPABASE_PUBLISHABLE_KEY: 'configured', SUPABASE_SECRET_KEY: 'configured', AUTH_COOKIE_SECRET: 'configured', APP_ORIGIN: 'configured', SMTP_HOST: 'configured', SMTP_PORT: '465', SMTP_USERNAME: 'configured', SMTP_PASSWORD: 'configured', SMTP_FROM_EMAIL: 'configured' };
  const report = evaluateReadiness(facts(), env);
  assert.equal(report.checks.identityManifestApproval.status, STATUS.NOT_CONFIGURED);
  assert.equal(report.checks.smtpReadiness.status, STATUS.BLOCKED);
  assert.equal(report.checks.rollbackPrerequisites.status, STATUS.NOT_CONFIGURED);
});

test('unsafe early runtime activation is a failure', () => {
  const report = evaluateReadiness(facts(), { DATA_BACKEND: 'postgres', AUTH_BACKEND: 'supabase', ENABLE_POSTGRES_RUNTIME: '1' });
  assert.equal(report.checks.currentRuntimeSafety.status, STATUS.FAIL);
  assert.equal(report.overall, STATUS.FAIL);
});
