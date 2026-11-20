'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const migration = require('./stage3i');
const readiness = require('../cutover-readiness');

const PRIVATE_ROOT = path.resolve(__dirname, '..', '..', '.private', 'production-evidence');
const PRIVATE_TEXT = /(?:password|secret|token|connection|string|private[_-]?key|smtp[_-]?password)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;

function assertPrivate(file, privateRoot = PRIVATE_ROOT) {
  const resolved = path.resolve(file), root = path.resolve(privateRoot) + path.sep;
  if (!resolved.startsWith(root)) throw new Error('Evidence output must remain under .private/production-evidence.');
  return resolved;
}
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, PRIVATE_TEXT.test(key) ? '[redacted]' : redact(item)]));
  return typeof value === 'string' ? value.replace(EMAIL, '[redacted-email]') : value;
}
function atomicWrite(file, value, privateRoot = PRIVATE_ROOT) {
  const resolved = assertPrivate(file, privateRoot); fs.mkdirSync(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temporary = `${resolved}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try { fs.writeFileSync(temporary, JSON.stringify(redact(value), null, 2), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, resolved); }
  finally { try { if (fs.existsSync(temporary)) fs.rmSync(temporary); } catch { /* best effort */ } }
  return resolved;
}
function snapshotEvidence(file, provenance = {}) {
  const state = readiness.inspectSqlite(file);
  if (!state.exists) return { version:1,kind:'snapshot-validation',status:'FAIL',reason:'SNAPSHOT_MISSING' };
  let compatibility;
  try { const source=migration.readSource(file); compatibility={status:'PASS',sourceTables:Object.keys(source.data).length,rowCounts:source.counts}; }
  catch(error){ compatibility={status:'FAIL',code:error.code||'SOURCE_INCOMPATIBLE'}; }
  const provenanceReady = ['sourceSystem','capturedAt','capturedBy','custodyReference'].every(key => String(provenance[key] || '').trim());
  return { version:1,kind:'snapshot-validation',generatedAt:new Date().toISOString(),status:state.integrity==='ok'&&state.foreignKeyViolations===0&&compatibility.status==='PASS'&&provenanceReady?'PASS':'BLOCKED',
    snapshot:{sha256:state.sha256,tables:state.tables.length,identities:state.users,integrity:state.integrity,foreignKeyViolations:state.foreignKeyViolations},
    compatibility,provenance:{status:provenanceReady?'PASS':'NOT_CONFIGURED',sourceSystem:provenance.sourceSystem||null,capturedAt:provenance.capturedAt||null,capturedBy:provenance.capturedBy||null,custodyReference:provenance.custodyReference||null},
    approval:{status:'NOT_CONFIGURED',note:'This report does not select or approve the snapshot.'} };
}
function gateInventory(report) {
  const owners={productionSnapshotApproval:['Data owner','Independent restore reviewer'],backupRestoreApproval:['Backup operator','Independent restore reviewer'],identityManifestApproval:['Identity owner','Privacy reviewer'],administratorMappingApproval:['Business owner','Independent security reviewer'],smtpReadiness:['Email owner','Security reviewer'],storageReadiness:['Storage owner','Independent verifier'],maintenanceWindowApproval:['Incident commander','Business owner'],writeFreezeReadiness:['Runtime owner','Migration verifier'],monitoringReadiness:['Operations owner','Incident commander'],rollbackAuthority:['Rollback authority','Business owner'],localSchemaInventory:['Database owner','Migration verifier'],cloudSchemaEvidence:['Supabase owner','Security reviewer'],runtimeConfigurationReadiness:['Deployment owner','Security reviewer']};
  return Object.fromEntries(Object.entries(owners).map(([gate,[owner,reviewer]])=>[gate,{status:report.checks[gate]?.status||'NOT_CONFIGURED',owner,independentReviewer:reviewer,approvalRequired:true,fingerprintBinding:['productionSnapshotApproval','backupRestoreApproval','identityManifestApproval','storageReadiness'].includes(gate),freshness:'Approval must include approvedAt and a future expiresAt; artifact changes invalidate it.'}]));
}
function templateBundle() {
  const approval=()=>({approved:false,approvedBy:null,approvedAt:null,expiresAt:null});
  return {version:1,productionSnapshot:{...approval(),sha256:null},backupRestore:{...approval(),restoredSha256:null},identityManifest:{...approval(),sha256:null},administratorMapping:approval(),
    smtp:{...approval(),providerSelected:false,domainVerified:false,senderVerified:false,templatesApproved:false,deliveryTested:false,bounceHandling:false,rateLimitsReviewed:false,failureRecoveryTested:false},
    storage:{...approval(),inventorySha256:null,ownershipVerified:false,bucketPoliciesVerified:false,backupVerified:false,restoreVerified:false,missingObjectCheckPassed:false,rollbackReviewed:false},
    operations:{maintenanceWindow:approval(),writeFreeze:approval(),monitoring:approval(),rollbackAuthority:approval()},runtimeConfiguration:approval()};
}
function candidateInventory(root=path.resolve(__dirname,'..','..')){
  const active=path.resolve(root,'data','teachersinn.db'),directories=['backup','backups','snapshot','snapshots',path.join('.private','production-backups')].map(name=>path.resolve(root,name));
  const files=[];for(const directory of directories){if(!fs.existsSync(directory))continue;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){if(entry.isFile()&&entry.name.toLowerCase().endsWith('.db'))files.push(path.join(directory,entry.name));}}
  const candidates=files.filter(file=>path.resolve(file)!==active).map(file=>{let provenance={},durableReport=null;const sidecar=`${file}.provenance.json`,durable=path.join(root,'.private','production-evidence',`${path.basename(file,'.db')}.backup-report.json`);try{if(fs.existsSync(sidecar))provenance=JSON.parse(fs.readFileSync(sidecar,'utf8'));else if(fs.existsSync(durable)){durableReport=JSON.parse(fs.readFileSync(durable,'utf8'));provenance={...(durableReport.provenance||{}),capturedAt:durableReport.createdAt};}}catch{provenance={};}const report=snapshotEvidence(file,provenance);return{identifier:crypto.createHash('sha256').update(path.relative(root,file)).digest('hex').slice(0,16),fileName:path.basename(file),...report,restoreVerificationStatus:durableReport?.restoreVerification?.status||'NOT_CONFIGURED'};});
  const restoreReady=candidates.length>0&&candidates.every(candidate=>candidate.restoreVerificationStatus==='PASS');
  return{version:1,kind:'candidate-inventory',generatedAt:new Date().toISOString(),status:candidates.length?'BLOCKED':'NOT_CONFIGURED',searchedLocations:directories.map(directory=>path.relative(root,directory)),activeDatabaseExcluded:true,candidateCount:candidates.length,candidates,
    restoreEvidenceStatus:restoreReady?'PASS':'NOT_CONFIGURED',missingEvidence:candidates.length?[...(restoreReady?[]:['independent restore verification']),'snapshot selection approval','restore approval']:['separate candidate SQLite backup','backup provenance','independent restore verification','snapshot selection approval','restore approval'],
    approvalRequirements:{snapshotApproval:'NOT_CONFIGURED',restoreApproval:'NOT_CONFIGURED',note:'Discovery and validation never grant approval.'}};
}
function main(){
  const arg=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
  const command=process.argv[2]||'inventory', out=arg('--out');
  if(command==='snapshot'){
    const file=arg('--db');if(!file)throw new Error('--db is required.');const provenance=arg('--provenance')?JSON.parse(fs.readFileSync(arg('--provenance'),'utf8')):{};
    const report=snapshotEvidence(file,provenance);if(out)atomicWrite(out,report);console.log(JSON.stringify(redact(report),null,2));if(report.status==='FAIL')process.exitCode=1;return;
  }
  if(command==='templates'){
    if(!out)throw new Error('--out under .private/production-evidence is required.');atomicWrite(out,templateBundle());console.log(JSON.stringify({status:'PASS',created:path.basename(out),approvalsGranted:0},null,2));return;
  }
  if(command==='candidates'){
    const report=candidateInventory();if(!out)throw new Error('--out under .private/production-evidence is required.');atomicWrite(out,report);console.log(JSON.stringify(report,null,2));return;
  }
  const facts=readiness.inspectFacts(), report=readiness.evaluateReadiness(facts), inventory={version:1,generatedAt:new Date().toISOString(),overall:report.overall,gates:gateInventory(report)};
  if(out)atomicWrite(out,inventory);console.log(JSON.stringify(inventory,null,2));
}
if(require.main===module){try{main();}catch(error){console.error(String(error.message||error).replace(EMAIL,'[redacted-email]'));process.exitCode=1;}}
module.exports={PRIVATE_ROOT,assertPrivate,redact,atomicWrite,snapshotEvidence,gateInventory,templateBundle,candidateInventory};
