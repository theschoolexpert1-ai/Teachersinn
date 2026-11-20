'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const { createPostgresLearningRepository }=require('../src/postgres/repositories/learning.repository');
const { createPostgresAdminLearningRepository }=require('../src/postgres/repositories/admin-learning.repository');

const identity={authUserId:'123e4567-e89b-42d3-a456-426614174000',verified:true};

function connection(handler){const calls=[];const db={
  async many(sql,values){calls.push({kind:'many',sql,values});return handler('many',sql,values);},
  async maybeOne(sql,values){calls.push({kind:'maybeOne',sql,values});return handler('maybeOne',sql,values);},
  async one(sql,values){calls.push({kind:'one',sql,values});return handler('one',sql,values);},
  async execute(sql,values){calls.push({kind:'execute',sql,values});return handler('execute',sql,values);},
};return{calls,withUserTransaction:async(i,work,options)=>{calls.push({kind:'userTx',identity:i,options});return work(db);},withAnonymousTransaction:async(work,options)=>{calls.push({kind:'anonTx',options});return work(db);}};}

test('learning catalogue, detail and enrollment derive ownership from verified identity',async()=>{
  const c=connection((kind,sql)=>{
    if(/from public\.courses c cross join lateral/.test(sql))return[];
    if(/select \* from public\.courses/.test(sql))return{id:4,status:'published'};
    if(/select \* from public\.enrollments/.test(sql))return null;
    if(/course_lesson_outline/.test(sql))return[{id:8,position:1,body:'preview',locked:false},{id:9,position:2,body:null,locked:true}];
    if(/select id from public\.courses/.test(sql))return{id:4};
    if(/insert into public\.enrollments/.test(sql))return{user_id:identity.authUserId,course_id:4};
    return null;
  });
  const repository=createPostgresLearningRepository({connection:c});
  await repository.listCourses(identity);
  const detail=await repository.courseDetail(identity,4);assert.equal(detail.lessons[1].locked,true);
  const enrollment=await repository.enroll(identity,4);assert.equal(enrollment.user_id,identity.authUserId);
  const insert=c.calls.find(x=>/insert into public\.enrollments/.test(x.sql||''));
  assert.deepEqual(insert.values,[identity.authUserId,4]);assert.match(insert.sql,/on conflict\(user_id,course_id\) do nothing/);
});

test('completion, CPD and certificates use database-authoritative operations',async()=>{
  const c=connection((kind,sql)=>{
    if(/complete_course_lesson/.test(sql))return{course_complete:true,certificate_code:'TIN-ABCDEF1234',newly_completed:true};
    if(/coalesce\(sum/.test(sql))return{hours:4,completions:1};
    if(/from public\.enrollments e join public\.courses/.test(sql))return[];
    return null;
  });
  const repository=createPostgresLearningRepository({connection:c});
  const result=await repository.completeLesson(identity,8);assert.equal(result.certificate_code,'TIN-ABCDEF1234');
  const cpd=await repository.cpdSummary(identity,2026);assert.deepEqual({hours:cpd.hours,completions:cpd.completions},{hours:4,completions:1});
  assert.equal(c.calls.some(x=>/update public\.enrollments/.test(x.sql||'')),false,'repository must not trust an application completion flag');
});

test('public certificate verification uses only the anonymous transaction boundary',async()=>{
  const c=connection((kind,sql,values)=>/verify_certificate/.test(sql)?{name:'Teacher',title:'Course',cpd_hours:2,completed_at:'2026-01-01'}:null);
  const repository=createPostgresLearningRepository({connection:c});
  const certificate=await repository.verifyCertificate('tin-abcdef1234');
  assert.equal(certificate.certificate_code,'TIN-ABCDEF1234');assert.equal(c.calls.filter(x=>x.kind==='anonTx').length,1);
  assert.equal(Object.hasOwn(certificate,'email'),false);assert.equal(Object.hasOwn(certificate,'user_id'),false);
});

test('administrator learning operations verify database role and preserve atomic curriculum writes',async()=>{
  const denied=connection((kind,sql)=>/is_admin/.test(sql)?{authorized:false}:null);
  await assert.rejects(()=>createPostgresAdminLearningRepository({connection:denied}).listCourses(identity),e=>e.status===403);
  assert.equal(denied.calls.some(x=>/from public\.courses c/.test(x.sql||'')),false);

  let nextId=20;
  const allowed=connection((kind,sql)=>{
    if(/is_admin/.test(sql))return{authorized:true};
    if(/insert into public\.courses/.test(sql))return{id:5,status:'draft'};
    if(/insert into public\.lessons/.test(sql))return{id:nextId++};
    if(/select id from public\.courses/.test(sql))return{id:5};
    if(kind==='execute')return 2;
    return null;
  });
  const admin=createPostgresAdminLearningRepository({connection:allowed});
  const created=await admin.createCourse(identity,{title:'Course',category:'Testing',level:'Beginner',summary:'Summary',instructor:'Faculty',cpd_hours:2,description:'Description',thumbnail:'',objectives:'',prerequisites:'',estimated_minutes:20,status:'draft'},[{title:'One',body:'Lesson body',minutes:20}]);
  assert.equal(created.id,5);
  await admin.replaceCurriculum(identity,5,[{title:'Replacement',body:'Replacement body',minutes:25}]);
  assert.equal(allowed.calls.filter(x=>x.kind==='userTx').length,2);
  assert.equal(allowed.calls.some(x=>/delete from public\.lessons/.test(x.sql||'')),true);
});

test('anonymous transactions assign only anon role and release the pooled client',async()=>{
  const {createPostgresConnection}=require('../src/postgres/connection');
  const calls=[];const client={async query(input){const sql=typeof input==='string'?input:input.text;calls.push(sql);if(sql==='select public.verify_certificate($1)')return{rows:[],rowCount:0};return{rows:[],rowCount:0};},release(){calls.push('RELEASE');}};
  class Pool{async connect(){return client;}async end(){}}
  const env={SUPABASE_DB_URL:'postgresql://postgres.project:secret@db.example.test:5432/postgres',SUPABASE_DB_CA_CERT:'-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----'};
  const c=createPostgresConnection({env,PoolClass:Pool});await c.withAnonymousTransaction(db=>db.many('select public.verify_certificate($1)',['TIN-X']),{readOnly:true});await c.close();
  assert.match(calls.join('\n'),/SET LOCAL ROLE anon/);assert.doesNotMatch(calls.join('\n'),/ROLE authenticated|request\.jwt/);assert.deepEqual(calls.slice(-2),['COMMIT','RELEASE']);
});

