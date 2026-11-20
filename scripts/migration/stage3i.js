'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const USER_COLUMNS = [
  'id','name','email','role','status','designation','school','subjects','grades','board','city','state','bio',
  'experience_years','open_to_mentor','directory_visible','consent_at','consent_version','last_login_at','created_at',
];
const SOURCE_TABLES = [
  'users','sessions','audit_log','courses','lessons','enrollments','lesson_progress','workshops','workshop_regs',
  'connections','messages','communities','posts','replies','tickets','ticket_replies','mentorships','tutorials',
  'tutorial_views','lesson_plans','jobs','career_profiles','job_applications','notifications','notification_preferences',
  'schema_migrations',
];
const TARGET_TABLES = [
  'profiles','account_settings','legacy_user_map','audit_log','courses','lessons','enrollments','lesson_progress',
  'workshops','workshop_regs','connections','messages','communities','posts','replies','tickets','ticket_replies',
  'mentorships','tutorials','tutorial_views','lesson_plans','jobs','career_profiles','job_applications','notifications',
  'notification_preferences',
];
const IDENTITY_COLUMNS = new Set([
  'user_id','created_by','requester_id','addressee_id','sender_id','recipient_id','mentee_id','mentor_id','posted_by',
  'attendance_verified_by',
]);
const SOURCE_FOREIGN_KEYS = Object.freeze({
  audit_log:[['user_id','users',true]], lessons:[['course_id','courses']], enrollments:[['user_id','users'],['course_id','courses']],
  lesson_progress:[['user_id','users'],['lesson_id','lessons']], workshops:[['created_by','users',true]],
  workshop_regs:[['user_id','users'],['workshop_id','workshops'],['attendance_verified_by','users',true]],
  connections:[['requester_id','users'],['addressee_id','users']], messages:[['sender_id','users'],['recipient_id','users']],
  posts:[['community_id','communities'],['user_id','users']], replies:[['post_id','posts'],['user_id','users']],
  tickets:[['user_id','users']], ticket_replies:[['ticket_id','tickets'],['user_id','users',true]],
  mentorships:[['mentee_id','users'],['mentor_id','users']], tutorial_views:[['user_id','users'],['tutorial_id','tutorials']],
  lesson_plans:[['user_id','users']], jobs:[['posted_by','users',true]], career_profiles:[['user_id','users']],
  job_applications:[['user_id','users'],['job_id','jobs']], notifications:[['user_id','users']],
  notification_preferences:[['user_id','users']],
});
const TABLE_MAP = Object.freeze({
  users:['profiles','account_settings','legacy_user_map'], sessions:[], schema_migrations:[],
  audit_log:['audit_log'], courses:['courses'], lessons:['lessons'], enrollments:['enrollments'],
  lesson_progress:['lesson_progress'], workshops:['workshops'], workshop_regs:['workshop_regs'],
  connections:['connections'], messages:['messages'], communities:['communities'], posts:['posts'], replies:['replies'],
  tickets:['tickets'], ticket_replies:['ticket_replies'], mentorships:['mentorships'], tutorials:['tutorials'],
  tutorial_views:['tutorial_views'], lesson_plans:['lesson_plans'], jobs:['jobs'], career_profiles:['career_profiles'],
  job_applications:['job_applications'], notifications:['notifications'], notification_preferences:['notification_preferences'],
});
const DEPENDENCIES = Object.freeze({
  profiles:[], account_settings:[], legacy_user_map:[], communities:[], courses:[], tutorials:[],
  audit_log:['profiles'], lessons:['courses'], enrollments:['profiles','courses','lessons'], lesson_progress:['profiles','lessons','enrollments'],
  workshops:['profiles'], workshop_regs:['profiles','workshops'], connections:['profiles'], messages:['profiles','connections','mentorships'],
  posts:['communities','profiles'], replies:['posts','profiles'], tickets:['profiles'], ticket_replies:['tickets','profiles'],
  mentorships:['profiles'], tutorial_views:['profiles','tutorials'], lesson_plans:['profiles'], jobs:['profiles'],
  career_profiles:['profiles'], job_applications:['profiles','jobs'], notifications:['profiles'],
  notification_preferences:['profiles'],
});
const ALLOWED = Object.freeze({
  role:new Set(['educator','mentor','admin']), userStatus:new Set(['active','suspended']),
  connection:new Set(['pending','accepted','declined']), mentorship:new Set(['requested','active','declined','completed']),
  ticket:new Set(['open','in_progress','resolved','closed']), priority:new Set(['low','normal','high']),
  job:new Set(['open','closed']), attendance:new Set(['pending','attended','absent']),
  course:new Set(['draft','published','archived']), mode:new Set(['Online','In-person','Hybrid']),
});

class MigrationError extends Error { constructor(code,message,detail={}) { super(message); this.name='MigrationError';this.code=code;this.detail=detail; } }
const normalizeEmail = value => String(value||'').trim().toLowerCase();
const fingerprint = value => crypto.createHash('sha256').update(JSON.stringify(value,Object.keys(value).sort())).digest('hex');
function iso(value,{nullable=false,dateOnly=false}={}) {
  if ((value===null||value==='')&&nullable) return null;
  const date=new Date(value); if(Number.isNaN(date.getTime()))throw new MigrationError('INVALID_TIMESTAMP','Invalid timestamp');
  return dateOnly?date.toISOString().slice(0,10):date.toISOString();
}
function bool(value){if(value===true||value===1||value==='1')return true;if(value===false||value===0||value==='0')return false;throw new MigrationError('INVALID_BOOLEAN','Invalid boolean');}
function jsonArray(value){try{const parsed=Array.isArray(value)?value:JSON.parse(value);if(!Array.isArray(parsed))throw 0;return parsed;}catch{throw new MigrationError('INVALID_JSON','Expected a JSON array');}}
function assertAllowed(set,value,field){if(!set.has(value))throw new MigrationError('UNSUPPORTED_STATUS',`Unsupported ${field}`);return value;}

function readSource(databasePath) {
  const resolved=path.resolve(databasePath);const db=new DatabaseSync(resolved,{readOnly:true});
  try {
    const integrity=db.prepare('pragma integrity_check').get().integrity_check;
    const fk=db.prepare('pragma foreign_key_check').all();
    if(integrity!=='ok'||fk.length)throw new MigrationError('SOURCE_INTEGRITY','SQLite source failed integrity checks',{integrity,foreignKeyViolations:fk.length});
    db.exec('begin deferred transaction');
    const available=new Set(db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%'").all().map(x=>x.name));
    const data={};
    for(const table of SOURCE_TABLES){
      if(!available.has(table))throw new MigrationError('MISSING_SOURCE_TABLE',`Missing source table ${table}`);
      if(table==='sessions'){data[table]=[];continue;}
      if(table==='users')data.users=db.prepare(`select ${USER_COLUMNS.join(',')} from users order by id`).all();
      else data[table]=db.prepare(`select * from "${table}" order by rowid`).all();
    }
    db.exec('rollback');
    return {database:resolved,readOnly:true,data,counts:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length]))};
  } finally { try{db.close();}catch{} }
}

function validateManifest(manifest,users) {
  if(!manifest||manifest.version!==1||!Array.isArray(manifest.identities))throw new MigrationError('INVALID_MANIFEST','Identity manifest version 1 is required');
  const byLegacy=new Map(),byUuid=new Map(),byEmail=new Map();
  for(const item of manifest.identities){
    const legacy=Number(item.legacy_user_id),uuid=String(item.auth_user_id||'');const email=normalizeEmail(item.normalized_email);
    if(!Number.isSafeInteger(legacy)||legacy<1||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)||!email)throw new MigrationError('INVALID_IDENTITY_MAPPING','Invalid identity mapping');
    if(byLegacy.has(legacy)||byUuid.has(uuid)||byEmail.has(email))throw new MigrationError('DUPLICATE_IDENTITY_MAPPING','Duplicate legacy ID, UUID, or normalized email');
    byLegacy.set(legacy,item);byUuid.set(uuid,item);byEmail.set(email,item);
  }
  const normalized=new Set();
  for(const user of users){
    const email=normalizeEmail(user.email);if(normalized.has(email))throw new MigrationError('DUPLICATE_SOURCE_EMAIL','Duplicate normalized source email');normalized.add(email);
    const item=byLegacy.get(Number(user.id));if(!item)throw new MigrationError('MISSING_IDENTITY_MAPPING',`Missing mapping for legacy user ${user.id}`);
    if(normalizeEmail(item.normalized_email)!==email)throw new MigrationError('IDENTITY_EMAIL_MISMATCH',`Manifest email mismatch for legacy user ${user.id}`);
    if(item.approved_role!==user.role)throw new MigrationError('ROLE_MISMATCH',`Approved role mismatch for legacy user ${user.id}`);
  }
  if(byLegacy.size!==users.length)throw new MigrationError('EXTRA_IDENTITY_MAPPING','Manifest contains identities absent from source');
  return {byLegacy};
}

function planDependencies(dependencies=DEPENDENCIES){
  const remaining=new Map(Object.entries(dependencies).map(([k,v])=>[k,new Set(v)])),order=[];
  while(remaining.size){const ready=[...remaining].filter(([,deps])=>[...deps].every(x=>order.includes(x))).map(([k])=>k).sort();if(!ready.length)throw new MigrationError('DEPENDENCY_CYCLE','Target dependency cycle detected');for(const key of ready){order.push(key);remaining.delete(key);}}
  return order;
}
function validateSourceRelationships(source){
  const ids={};for(const [table,rows] of Object.entries(source))ids[table]=new Set(rows.map(row=>String(row.id??row.user_id)));
  for(const [table,links] of Object.entries(SOURCE_FOREIGN_KEYS))for(const row of source[table]||[])for(const [column,parent,nullable=false] of links){const value=row[column];if(nullable&&(value===null||value===undefined))continue;if(!ids[parent]?.has(String(value)))throw new MigrationError('INVALID_FOREIGN_KEY',`${table}.${column} references a missing ${parent} record`);}
  const certificates=new Set();for(const row of source.enrollments||[]){if(!row.certificate_code)continue;if(certificates.has(row.certificate_code))throw new MigrationError('DUPLICATE_CERTIFICATE','Duplicate certificate code');certificates.add(row.certificate_code);}
  const lessonCourse=new Map((source.lessons||[]).map(row=>[String(row.id),String(row.course_id)]));const enrolled=new Set((source.enrollments||[]).map(row=>`${row.user_id}:${row.course_id}`));for(const row of source.lesson_progress||[]){if(!enrolled.has(`${row.user_id}:${lessonCourse.get(String(row.lesson_id))}`))throw new MigrationError('OWNERSHIP_MISMATCH','Lesson progress owner is not enrolled in the lesson course');}
  const roles=new Map((source.users||[]).map(row=>[String(row.id),row.role]));for(const row of source.workshop_regs||[])if(row.attendance_verified_by!=null&&roles.get(String(row.attendance_verified_by))!=='admin')throw new MigrationError('INVALID_ADMIN_MAPPING','Workshop attendance verifier is not an administrator');
}
function validateBusinessRules(source){
  for(const row of source.courses||[])if(Boolean(row.published)!==(row.status==='published'))throw new MigrationError('COURSE_PUBLICATION_MISMATCH','Course published flag and lifecycle status disagree');
  const workshopById=new Map((source.workshops||[]).map(row=>[String(row.id),row])),registrations=new Map();for(const row of source.workshop_regs||[]){const key=String(row.workshop_id);registrations.set(key,(registrations.get(key)||0)+1);const attended=Boolean(row.attended);if(attended!==(row.attendance_status==='attended'))throw new MigrationError('ATTENDANCE_MISMATCH','Workshop attendance boolean and status disagree');if(row.attendance_status==='pending'&&(row.attendance_verified_at!=null||row.attendance_verified_by!=null))throw new MigrationError('ATTENDANCE_MISMATCH','Pending attendance cannot have verification evidence');if(row.attendance_status!=='pending'&&(row.attendance_verified_at==null||row.attendance_verified_by==null))throw new MigrationError('ATTENDANCE_MISMATCH','Final attendance requires verification evidence');}for(const [id,count] of registrations)if(count>Number(workshopById.get(id)?.capacity||0))throw new MigrationError('WORKSHOP_CAPACITY_EXCEEDED','Imported workshop registrations exceed capacity');
  const pairs=new Set();for(const row of source.connections||[]){const key=[Number(row.requester_id),Number(row.addressee_id)].sort((a,b)=>a-b).join(':');if(pairs.has(key))throw new MigrationError('DUPLICATE_CONNECTION_PAIR','Duplicate unordered connection pair');pairs.add(key);}
  const openMentorships=new Set();for(const row of source.mentorships||[]){if(!['requested','active'].includes(row.status))continue;const key=`${row.mentee_id}:${row.mentor_id}`;if(openMentorships.has(key))throw new MigrationError('DUPLICATE_OPEN_MENTORSHIP','Duplicate open mentorship pair');openMentorships.add(key);}
  const eligible=new Set();for(const row of source.connections||[])if(row.status==='accepted')eligible.add([Number(row.requester_id),Number(row.addressee_id)].sort((a,b)=>a-b).join(':'));for(const row of source.mentorships||[])if(row.status==='active')eligible.add([Number(row.mentee_id),Number(row.mentor_id)].sort((a,b)=>a-b).join(':'));for(const row of source.messages||[]){const key=[Number(row.sender_id),Number(row.recipient_id)].sort((a,b)=>a-b).join(':');if(!eligible.has(key))throw new MigrationError('MESSAGE_ELIGIBILITY_MISSING','Message participants lack an accepted connection or active mentorship');}
  const lessonsByCourse=new Map();for(const row of source.lessons||[]){const key=String(row.course_id);if(!lessonsByCourse.has(key))lessonsByCourse.set(key,[]);lessonsByCourse.get(key).push(String(row.id));}const progress=new Set((source.lesson_progress||[]).map(row=>`${row.user_id}:${row.lesson_id}`));for(const row of source.enrollments||[]){const complete=row.completed_at!=null,cert=row.certificate_code!=null;if(complete!==cert)throw new MigrationError('CERTIFICATE_COMPLETION_MISMATCH','Completion and certificate must be present together');if(complete)for(const lesson of lessonsByCourse.get(String(row.course_id))||[])if(!progress.has(`${row.user_id}:${lesson}`))throw new MigrationError('INCOMPLETE_COURSE_PROGRESS','Completed enrollment is missing lesson progress');}
}
function mappedId(value,identity,{nullable=false}={}){if((value===null||value===undefined)&&nullable)return null;const found=identity.byLegacy.get(Number(value));if(!found)throw new MigrationError('MISSING_IDENTITY_REFERENCE','Referenced legacy identity has no approved mapping');return found.auth_user_id;}

function transform(source,manifest){
  validateSourceRelationships(source);validateBusinessRules(source);const identity=validateManifest(manifest,source.users);const out=Object.fromEntries(TARGET_TABLES.map(t=>[t,[]]));
  for(const u of source.users){const id=mappedId(u.id,identity),created=iso(u.created_at);assertAllowed(ALLOWED.role,u.role,'role');assertAllowed(ALLOWED.userStatus,u.status,'status');out.profiles.push({id,legacy_id:u.id,name:u.name||'',designation:u.designation||'',school:u.school||'',subjects:u.subjects||'',grades:u.grades||'',board:u.board||'',city:u.city||'',state:u.state||'',bio:u.bio||'',experience_years:Number(u.experience_years||0),open_to_mentor:bool(u.open_to_mentor),directory_visible:bool(u.directory_visible),created_at:created,updated_at:created});out.account_settings.push({id,role:u.role,status:u.status,consent_at:iso(u.consent_at,{nullable:true}),consent_version:u.consent_version||'1.0',last_login_at:iso(u.last_login_at,{nullable:true}),created_at:created,updated_at:created});out.legacy_user_map.push({legacy_user_id:u.id,auth_user_id:id,normalized_email:normalizeEmail(u.email),migration_status:'pending'});}
  for(const [table,rows] of Object.entries(source)){
    if(['users','sessions','schema_migrations'].includes(table))continue;
    for(const original of rows){const row={...original};for(const key of Object.keys(row))if(IDENTITY_COLUMNS.has(key))row[key]=mappedId(row[key],identity,{nullable:true});for(const key of Object.keys(row)){if(key.endsWith('_at')||key==='starts_at')row[key]=iso(row[key],{nullable:true});if(['published','attended','saved'].includes(key)&&row[key]!==null)row[key]=bool(row[key]);}
      if(table==='tutorials')row.steps=jsonArray(row.steps);
      if(table==='notification_preferences')for(const key of ['messages','connections','community','workshops','learning','mentorship','support'])row[key]=bool(row[key]);
      if(table==='lesson_plans')row.plan_date=row.plan_date?iso(row.plan_date,{dateOnly:true}):null;
      if(table==='courses')assertAllowed(ALLOWED.course,row.status,'course status');
      if(table==='workshops')assertAllowed(ALLOWED.mode,row.mode,'workshop mode');
      if(table==='workshop_regs')assertAllowed(ALLOWED.attendance,row.attendance_status,'attendance status');
      if(table==='connections')assertAllowed(ALLOWED.connection,row.status,'connection status');
      if(table==='mentorships')assertAllowed(ALLOWED.mentorship,row.status,'mentorship status');
      if(table==='tickets'){assertAllowed(ALLOWED.ticket,row.status,'ticket status');assertAllowed(ALLOWED.priority,row.priority,'ticket priority');}
      if(table==='jobs')assertAllowed(ALLOWED.job,row.status,'job status');
      if(table==='audit_log'){row.legacy_user_id=original.user_id??null;row.user_id=mappedId(original.user_id,identity,{nullable:true});}
      out[TABLE_MAP[table][0]].push(row);
    }
  }
  return out;
}

function buildPlan(source,manifest){const transformed=transform(source.data||source,manifest),order=planDependencies();const batches=[];for(const table of order){const rows=transformed[table]||[];batches.push({id:`stage3i:${table}`,table,count:rows.length,fingerprint:fingerprint(rows),rows});}return{version:1,mode:'dry-run',order,batches,sourceCounts:Object.fromEntries(Object.entries(source.data||source).map(([k,v])=>[k,v.length])),targetCounts:Object.fromEntries(Object.entries(transformed).map(([k,v])=>[k,v.length]))};}

async function executePlan(plan,adapter,{execute=false,checkpoint={completed:{}}}={}){
  if(!execute)return{mode:'dry-run',writes:0,checkpoint,planned:plan.batches.map(({id,table,count,fingerprint})=>({id,table,count,fingerprint}))};
  if(!adapter||typeof adapter.transaction!=='function')throw new MigrationError('EXECUTOR_UNAVAILABLE','An explicitly authorized target adapter is required');
  let writes=0;for(const batch of plan.batches){if(checkpoint.completed[batch.id]===batch.fingerprint)continue;await adapter.transaction(async tx=>{for(const row of batch.rows){await tx.upsert(batch.table,row,{sourceFingerprint:fingerprint(row)});writes++;}});checkpoint.completed[batch.id]=batch.fingerprint;}return{mode:'execute',writes,checkpoint};
}
function verify(source,plan,target){const failures=[];for(const batch of plan.batches){const actual=target[batch.table]||[];if(actual.length!==batch.count)failures.push({table:batch.table,code:'COUNT_MISMATCH',expected:batch.count,actual:actual.length});const expectedFingerprints=new Set(batch.rows.map(fingerprint));for(const row of actual)if(!expectedFingerprints.has(fingerprint(row)))failures.push({table:batch.table,code:'CONTENT_MISMATCH'});}return{ok:failures.length===0,failures,sourceCounts:plan.sourceCounts,targetCounts:plan.targetCounts,ownershipChecks:plan.batches.filter(x=>x.rows.some(r=>Object.keys(r).some(k=>IDENTITY_COLUMNS.has(k)))).length};}
function redact(error){return{code:error.code||'MIGRATION_ERROR',message:String(error.message||'Migration failed').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig,'[redacted-email]'),detail:Object.fromEntries(Object.keys(error.detail||{}).map(k=>[k,'[redacted]']))};}
function loadManifest(file){return JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));}
module.exports={SOURCE_TABLES,TARGET_TABLES,TABLE_MAP,DEPENDENCIES,MigrationError,normalizeEmail,fingerprint,readSource,validateManifest,validateSourceRelationships,validateBusinessRules,planDependencies,transform,buildPlan,executePlan,verify,redact,loadManifest};
