'use strict';

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const STATUSES=Object.freeze(['PASS','FAIL','NOT_RUN','BLOCKED']);
const CHECKPOINTS=Object.freeze(['PREFLIGHT_COMPLETE','AUTH_IDENTITIES_CREATED','IMPORT_COMPLETE','CONTENT_VERIFIED','OWNERSHIP_VERIFIED','FOREIGN_KEYS_VERIFIED','IDEMPOTENCY_VERIFIED','CLEANUP_COMPLETE','POSTFLIGHT_COMPLETE']);
const CHECKS=Object.freeze(['projectVerification','tlsVerification','syntheticFixtureIdentity','expectedRecordCounts','actualRecordCounts','completedMigrationBatches','contentFingerprintComparison','identityMappingVerification','administratorOwnershipVerification','crossUserOwnershipVerification','foreignKeyVerification','businessRuleVerification','transactionRollback','checkpointRecovery','completedRunIdempotency','repeatedExecutionWriteCount','cleanupCompletion','independentZeroResidualPostflight']);
const SENSITIVE_KEY=/(password|secret|token|authorization|cookie|session|authUserIds|auth_user_id|email|connectionString)/i;
const EMAIL=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const UUID=/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function runId(now=new Date()){return `${now.toISOString().replace(/[:.]/g,'-')}-${crypto.randomBytes(6).toString('hex')}`;}
function sanitize(value,key=''){
  if(SENSITIVE_KEY.test(key))return '[redacted]';
  if(typeof value==='string')return value.replace(EMAIL,'[redacted-email]').replace(UUID,'[redacted-uuid]');
  if(Array.isArray(value))return value.map(item=>sanitize(item));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,sanitize(v,k)]));
  return value;
}
function atomicWrite(file,value,io=fs){
  const temp=`${file}.${process.pid}.tmp`;
  io.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  io.writeFileSync(temp,JSON.stringify(sanitize(value),null,2),{mode:0o600});
  io.renameSync(temp,file);
}
function initialReport(id=runId()){
  return{version:1,runId:id,fixture:'teachersinn-stage3i-synthetic-v1',startedAt:new Date().toISOString(),finishedAt:null,outcome:'IN_PROGRESS',checkpoints:Object.fromEntries(CHECKPOINTS.map(x=>[x,'NOT_RUN'])),checks:Object.fromEntries(CHECKS.map(x=>[x,{status:'NOT_RUN'}])),events:[]};
}
function validateStatus(status){if(!STATUSES.includes(status))throw new Error(`Invalid report status: ${status}`);}
function createReporter(options={}){
  if(typeof options==='string')options={directory:options};
  const{directory,path:explicitPath,io=fs,id}=options;
  const report=initialReport(id),file=explicitPath||path.join(directory||path.resolve('.private','stage3i-rehearsals'),`${report.runId}.migration-report.json`);
  const persist=()=>atomicWrite(file,report,io);
  persist();
  return{
    file,report,persist,
    check(name,status,evidence={}){if(!CHECKS.includes(name))throw new Error(`Unknown report check: ${name}`);validateStatus(status);report.checks[name]={status,evidence:sanitize(evidence)};report.events.push({at:new Date().toISOString(),type:'CHECK',name,status});persist();},
    checkpoint(name,status='PASS',evidence={}){if(!CHECKPOINTS.includes(name))throw new Error(`Unknown report checkpoint: ${name}`);validateStatus(status);report.checkpoints[name]=status;report.events.push({at:new Date().toISOString(),type:'CHECKPOINT',name,status,evidence:sanitize(evidence)});persist();},
    finish(outcome){report.finishedAt=new Date().toISOString();report.outcome=outcome;persist();return report;}
  };
}
function requiredEvidenceComplete(report){return CHECKS.every(name=>report.checks[name]?.status==='PASS')&&CHECKPOINTS.every(name=>report.checkpoints[name]==='PASS');}
function exitCode(report){return report.outcome==='PASS'&&requiredEvidenceComplete(report)?0:1;}

module.exports={STATUSES,CHECKPOINTS,CHECKS,runId,sanitize,atomicWrite,initialReport,createReporter,requiredEvidenceComplete,exitCode};
