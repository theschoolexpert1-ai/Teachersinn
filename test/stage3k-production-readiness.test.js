'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STATUS, evaluateReadiness } = require('../scripts/cutover-readiness');

const HASH = 'a'.repeat(64), UUID = i => `${String(i).padStart(8, '0')}-1111-4111-8111-${String(i).padStart(12, '0')}`;
const approval = extra => ({ approved: true, approvedBy: 'independent-reviewer', approvedAt: '2026-11-20T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z', ...extra });
function identities() {
  return Array.from({ length: 12 }, (_, index) => ({ legacy_user_id: index + 1, auth_user_id: UUID(index + 1),
    normalized_email: `synthetic-${index + 1}@example.test`, approved_role: index === 0 ? 'admin' : 'educator',
    account_status: index === 11 ? 'suspended' : 'active', emailOwnershipApproved: true,
    administratorApproved: index === 0, approvalReference: `synthetic-approval-${index + 1}` }));
}
function completeFacts(change = {}) {
  const approvals = {
    productionSnapshot: approval({ sha256: HASH }), backupRestore: approval({ restoredSha256: HASH }),
    identityManifest: approval({ sha256: HASH }), administratorMapping: approval(),
    smtp: approval({ providerSelected:true,domainVerified:true,senderVerified:true,templatesApproved:true,deliveryTested:true,bounceHandling:true,rateLimitsReviewed:true,failureRecoveryTested:true }),
    storage: approval({ inventorySha256:HASH,ownershipVerified:true,bucketPoliciesVerified:true,backupVerified:true,restoreVerified:true,missingObjectCheckPassed:true,rollbackReviewed:true }),
    operations: { maintenanceWindow:approval(),writeFreeze:approval(),monitoring:approval(),rollbackAuthority:approval() }, runtimeConfiguration: approval(),
  };
  return { source:{exists:true,sha256:HASH,integrity:'ok',foreignKeyViolations:0,tables:Array(26).fill('t'),users:12,duplicateNormalizedEmails:0},
    compatibility:{ok:true,sourceTables:26},backup:{exists:true,sha256:HASH,integrity:'ok',foreignKeyViolations:0,tables:Array(26).fill('t'),users:12},
    identityManifest:{exists:true,hash:HASH,data:{version:1,identities:identities()}},storageInventory:{exists:true,hash:HASH,data:{version:1,buckets:[]}},
    approvals:{exists:true,hash:HASH,data:approvals},migrations:13,
    rehearsal:{report:{outcome:'PASS',runId:'synthetic-safe-run',checks:{projectVerification:{status:'PASS'},tlsVerification:{status:'PASS'},independentZeroResidualPostflight:{status:'PASS'}}}}, ...change };
}
const fullEnv = { DATA_BACKEND:'sqlite',AUTH_BACKEND:'legacy',SUPABASE_URL:'set',SUPABASE_PUBLISHABLE_KEY:'set',SUPABASE_SECRET_KEY:'set',
  AUTH_COOKIE_SECRET:'set',APP_ORIGIN:'set',SUPABASE_DB_URL:'set',SUPABASE_DB_CA_CERT_PATH:'set',SMTP_HOST:'set',SMTP_PORT:'465',SMTP_USERNAME:'set',SMTP_PASSWORD:'set',SMTP_FROM_EMAIL:'set' };

test('missing production snapshot cannot pass approval',()=>{const f=completeFacts({backup:null});const r=evaluateReadiness(f,fullEnv);assert.equal(r.checks.productionSnapshotApproval.status,STATUS.NOT_CONFIGURED);});
test('invalid snapshot fingerprint fails closed',()=>{const f=completeFacts();f.approvals.data.productionSnapshot.sha256='b'.repeat(64);const r=evaluateReadiness(f,fullEnv);assert.equal(r.checks.productionSnapshotApproval.status,STATUS.FAIL);});
test('missing independent restore approval is not a pass',()=>{const f=completeFacts();delete f.approvals.data.backupRestore;assert.equal(evaluateReadiness(f,fullEnv).checks.backupRestoreApproval.status,STATUS.NOT_CONFIGURED);});
test('missing identity approval blocks a valid manifest',()=>{const f=completeFacts();delete f.approvals.data.identityManifest;assert.equal(evaluateReadiness(f,fullEnv).checks.identityManifestApproval.status,STATUS.BLOCKED);});
test('duplicate identity mappings fail without exposing identity values',()=>{const f=completeFacts();f.identityManifest.data.identities[1].normalized_email=f.identityManifest.data.identities[0].normalized_email;const r=evaluateReadiness(f,fullEnv);assert.equal(r.checks.identityManifestApproval.status,STATUS.FAIL);assert.equal(JSON.stringify(r).includes('synthetic-1@example.test'),false);});
test('missing SMTP configuration remains NOT_CONFIGURED despite approval artifact',()=>{const env={...fullEnv};delete env.SMTP_PASSWORD;assert.equal(evaluateReadiness(completeFacts(),env).checks.smtpReadiness.status,STATUS.NOT_CONFIGURED);});
test('missing Storage inventory cannot be approved',()=>{assert.equal(evaluateReadiness(completeFacts({storageInventory:null}),fullEnv).checks.storageReadiness.status,STATUS.NOT_CONFIGURED);});
test('missing maintenance approval stays NOT_CONFIGURED',()=>{const f=completeFacts();delete f.approvals.data.operations.maintenanceWindow;assert.equal(evaluateReadiness(f,fullEnv).checks.maintenanceWindowApproval.status,STATUS.NOT_CONFIGURED);});
test('missing rollback authority prevents rollback readiness',()=>{const f=completeFacts();delete f.approvals.data.operations.rollbackAuthority;const r=evaluateReadiness(f,fullEnv);assert.equal(r.checks.rollbackAuthority.status,STATUS.NOT_CONFIGURED);assert.equal(r.checks.rollbackPrerequisites.status,STATUS.NOT_CONFIGURED);});
test('unsafe early runtime activation fails even with complete artifacts',()=>{const r=evaluateReadiness(completeFacts(),{...fullEnv,DATA_BACKEND:'postgres',AUTH_BACKEND:'supabase',ENABLE_POSTGRES_RUNTIME:'1'});assert.equal(r.checks.currentRuntimeSafety.status,STATUS.FAIL);});
test('complete synthetic approval fixtures satisfy every readiness gate without activating runtime',()=>{const r=evaluateReadiness(completeFacts(),fullEnv);const keys=['productionSnapshotApproval','backupRestoreApproval','identityManifestApproval','administratorMappingApproval','smtpReadiness','storageReadiness','maintenanceWindowApproval','writeFreezeReadiness','monitoringReadiness','rollbackAuthority','localSchemaInventory','cloudSchemaEvidence','runtimeConfigurationReadiness','cutoverRuntime'];for(const key of keys)assert.equal(r.checks[key].status,STATUS.PASS,key);assert.equal(r.overall,STATUS.PASS);assert.equal(r.checks.currentRuntimeSafety.status,STATUS.PASS);});
