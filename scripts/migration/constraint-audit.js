'use strict';
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const migration=require('./stage3i');const fixture=require('./synthetic-fixture');
const SOURCE_BY_TARGET={profiles:'users',account_settings:'users',legacy_user_map:'users'};
const RULES={
  account_settings:{trigger:'Auth creation pre-creates row; upsert fires server updated_at',business:'reviewed role/status; administrator mapping exact'},
  profiles:{trigger:'Auth creation pre-creates row; upsert fires server updated_at',business:'verified Auth UUID and legacy_id uniqueness'},
  legacy_user_map:{trigger:'none',business:'Auth UUID, legacy ID, and normalized email unique'},
  courses:{trigger:'publication trigger derives published from status',business:'valid lifecycle, CPD, duration and publication agreement'},
  lessons:{trigger:'curriculum lock rejects changes after enrollment',business:'unique positive course position; must precede enrollment'},
  enrollments:{trigger:'course row lock before insert',business:'published/history import; completion and certificate paired; lessons already fixed'},
  lesson_progress:{trigger:'none on direct insert',business:'owner enrolled in lesson course; completed enrollment has all lessons'},
  workshops:{trigger:'none on insert',business:'positive capacity/duration and valid mode'},
  workshop_regs:{trigger:'none on direct insert',business:'capacity; attended/status agreement; final attendance has admin evidence'},
  jobs:{trigger:'none on insert',business:'valid status/type and mapped optional administrator poster'},
  job_applications:{trigger:'updated_at only on update',business:'unique user/job; applied status; parent job exists'},
  connections:{trigger:'updated_at only on update',business:'distinct participants; unique unordered pair'},
  messages:{trigger:'none on direct insert',business:'accepted connection or active mentorship exists first; distinct participants'},
  communities:{trigger:'none',business:'unique name'},posts:{trigger:'updated_at only on update',business:'community and owner exist'},replies:{trigger:'updated_at only on update',business:'post and owner exist'},
  notification_preferences:{trigger:'updated_at only on update',business:'owner exists; boolean categories'},notifications:{trigger:'none',business:'owner exists; preserve private text without logging'},
  mentorships:{trigger:'status transition only on update',business:'distinct participants; unique requested/active pair; valid status'},
  tickets:{trigger:'none on insert',business:'owner, status, and priority valid'},ticket_replies:{trigger:'none on insert',business:'ticket precedes reply; nullable mapped actor'},
  tutorials:{trigger:'none',business:'steps explicitly bound as JSONB array; positive minutes'},tutorial_views:{trigger:'none',business:'owner and tutorial exist'},
  lesson_plans:{trigger:'updated_at only on update',business:'owner exists; valid date and duration'},
  career_profiles:{trigger:'updated_at only on update',business:'owner exists; template valid'},
  audit_log:{trigger:'none',business:'mapped nullable actor; retain legacy ID; administrator action not inferred'},
};
function validatePlanOrder(plan){const positions=new Map(plan.batches.map((x,i)=>[x.table,i]));for(const [table,dependencies] of Object.entries(migration.DEPENDENCIES))for(const dependency of dependencies)if((positions.get(dependency)??Infinity)>=(positions.get(table)??-1))throw new migration.MigrationError('INVALID_MIGRATION_ORDER',`${table} precedes prerequisite ${dependency}`);return true;}
function generateAudit(source,manifest){const plan=migration.buildPlan(source,manifest);validatePlanOrder(plan);const batches=plan.batches.map((batch,index)=>{const dependencies=migration.DEPENDENCIES[batch.table]||[],rule=RULES[batch.table]||{trigger:'none',business:'target checks and source foreign keys'};return{batch:index+1,source:SOURCE_BY_TARGET[batch.table]||batch.table,target:batch.table,records:batch.count,foreignKeyPrerequisites:dependencies,triggerPrerequisites:rule.trigger,businessPrerequisites:rule.business,identityMapping:batch.rows.some(row=>Object.keys(row).some(key=>key==='id'&&typeof row[key]==='string'||key.endsWith('_id')&&typeof row[key]==='string')),transformation:batch.table==='tutorials'?'SQLite JSON text -> validated JSONB array':'integer user ownership -> approved UUID; timestamps/booleans/statuses normalized as applicable',cleanup:[...dependencies].reverse()};});return{fixture:source.data?'teachersinn-stage3i-synthetic-v1':'in-memory',sourceRecords:Object.values(plan.sourceCounts).reduce((a,b)=>a+b,0)-Number(plan.sourceCounts.schema_migrations||0),targetRecords:Object.values(plan.targetCounts).reduce((a,b)=>a+b,0),batches};}
function syntheticAudit(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'teachersinn-constraint-audit-'));try{const made=fixture.createSyntheticFixture(path.join(root,'fixture.db'));return generateAudit(migration.readSource(made.path),fixture.manifest());}finally{fs.rmSync(root,{recursive:true,force:true});}}
if(require.main===module)console.log(JSON.stringify(syntheticAudit(),null,2));
module.exports={RULES,SOURCE_BY_TARGET,validatePlanOrder,generateAudit,syntheticAudit};
