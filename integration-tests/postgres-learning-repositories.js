'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createClient}=require('@supabase/supabase-js');
const {createPostgresConnection}=require('../src/postgres/connection');
const {createPostgresLearningRepository}=require('../src/postgres/repositories/learning.repository');
const {createPostgresAdminLearningRepository}=require('../src/postgres/repositories/admin-learning.repository');

const url=String(process.env.SUPABASE_TEST_URL||'').trim();
const secret=String(process.env.SUPABASE_TEST_SECRET_KEY||'').trim();
const ref=String(process.env.SUPABASE_TEST_PROJECT_REF||'').trim();
const opts={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
function safety(){assert.equal(process.env.RUN_SUPABASE_INTEGRATION,'1');assert.equal(process.env.RUN_STAGE3C_MUTATIONS,'1');assert.equal(process.env.SUPABASE_TEST_ALLOW_REMOTE,'1');assert.equal(process.env.SUPABASE_TEST_ENVIRONMENT,'development');assert.equal(ref,'ivnmrhwxdawmzaakdhec');assert.equal(new URL(url).hostname,`${ref}.supabase.co`);assert.ok(secret&&process.env.SUPABASE_DB_URL);assert.ok(process.env.SUPABASE_DB_CA_CERT||process.env.SUPABASE_DB_CA_CERT_PATH);}

test('Stage 3C cloud learning repositories preserve RLS, lifecycle, CPD and certificates',async()=>{
  safety();const service=createClient(url,secret,opts);const connection=createPostgresConnection({env:{...process.env,POSTGRES_POOL_MAX:'4'}});
  const users=[];let courseId=null;const suffix=`${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const make=async(label)=>{const r=await service.auth.admin.createUser({email:`stage3c-${label}-${suffix}@example.test`,password:`Stage3C!${crypto.randomBytes(12).toString('base64url')}`,email_confirm:true,user_metadata:{name:`Stage 3C ${label}`}});assert.ifError(r.error);users.push(r.data.user.id);return r.data.user.id;};
  try{
    const a=await make('teacher-a'),b=await make('teacher-b'),admin=await make('administrator');
    assert.ifError((await service.from('account_settings').update({role:'admin'}).eq('id',admin)).error);
    const A={authUserId:a,verified:true},B={authUserId:b,verified:true},ADMIN={authUserId:admin,verified:true};
    const learning=createPostgresLearningRepository({connection});const management=createPostgresAdminLearningRepository({connection});
    await assert.rejects(()=>management.createCourse(A,{title:'Forbidden',category:'Test'},[]),e=>e.status===403);
    const created=await management.createCourse(ADMIN,{title:`Stage 3C ${suffix}`,category:'Testing',level:'Intermediate',summary:'Disposable Stage 3C integration course.',instructor:'TeachersInn Test',cpd_hours:3,description:'Disposable course for authorized integration validation.',thumbnail:'',objectives:'Validate learning repositories',prerequisites:'',estimated_minutes:30,status:'draft'},[
      {title:'Preview lesson',body:'This disposable lesson validates safe preview behavior.',minutes:10},
      {title:'Protected lesson',body:'This disposable lesson validates enrolled access only.',minutes:20},
    ]);courseId=created.id;
    assert.equal((await learning.listCourses(A)).some(c=>c.id===courseId),false);
    await management.setCourseStatus(ADMIN,courseId,'published');
    const catalogue=await learning.listCourses(A);const item=catalogue.find(c=>c.id===courseId);assert.equal(item.lessons,2);assert.equal(item.minutes,30);assert.equal(item.learners,0);
    const preview=await learning.courseDetail(B,courseId);assert.ok(preview.lessons[0].body);assert.equal(preview.lessons[1].body,null);assert.equal(preview.lessons[1].locked,true);
    await assert.rejects(()=>learning.completeLesson(B,preview.lessons[1].id),e=>e.status===403);
    const enrollments=await Promise.all(Array.from({length:6},()=>learning.enroll(A,courseId)));assert.equal(enrollments.every(e=>e.user_id===a),true);
    const enrolled=await learning.courseDetail(A,courseId);assert.equal(enrolled.lessons.every(l=>l.locked===false),true);
    await assert.rejects(()=>management.replaceCurriculum(ADMIN,courseId,[{title:'Race',body:'Must remain blocked after enrollment.',minutes:5}]),e=>e.status===409);
    await learning.completeLesson(A,enrolled.lessons[0].id);
    const completions=await Promise.all(Array.from({length:5},()=>learning.completeLesson(A,enrolled.lessons[1].id)));
    assert.equal(completions.filter(x=>x.certificate_code).length,1);const code=completions.find(x=>x.certificate_code).certificate_code;assert.match(code,/^TIN-[A-F0-9]{10}$/);
    assert.equal((await learning.listCertificates(A)).filter(c=>c.course_id===courseId).length,1);
    assert.equal((await learning.listCertificates(B)).length,0);
    const cpd=await learning.cpdSummary(A,new Date().getUTCFullYear());assert.equal(cpd.hours,3);assert.equal(cpd.completions,1);
    const verified=await learning.verifyCertificate(code);assert.equal(verified.certificate_code,code);assert.equal(verified.title,created.title);assert.equal(Object.hasOwn(verified,'user_id'),false);assert.equal(Object.hasOwn(verified,'email'),false);
    assert.equal(await learning.verifyCertificate('TIN-NOTVALID00'),null);
    await management.setCourseStatus(ADMIN,courseId,'archived');assert.equal((await learning.courseDetail(A,courseId)).course.status,'archived');await assert.rejects(()=>learning.courseDetail(B,courseId),e=>e.status===404);
    await assert.rejects(()=>connection.withUserTransaction(A,async db=>{await db.execute("update public.profiles set bio='stage3c rollback' where id=$1",[a]);throw new Error('forced Stage 3C rollback');}),/forced Stage 3C rollback/);
    assert.notEqual((await connection.withUserTransaction(A,db=>db.one('select bio from public.profiles where id=$1',[a]),{readOnly:true})).bio,'stage3c rollback');
    assert.equal((await learning.listCertificates(B)).length,0,'pooled identity must not leak Teacher A certificate access');
  }finally{
    if(courseId){const adminId=users[2];if(adminId)try{await connection.withUserTransaction({authUserId:adminId,verified:true},async db=>{await db.execute('delete from public.enrollments where course_id=$1',[courseId]);await db.execute('delete from public.lessons where course_id=$1',[courseId]);await db.execute('delete from public.courses where id=$1',[courseId]);});}catch{/* service cleanup below is restricted to the captured course */}const cleanup=await service.from('courses').delete().eq('id',courseId);assert.ifError(cleanup.error);}
    try{await connection.close();}catch{}
    for(const id of users){const removed=await service.auth.admin.deleteUser(id);assert.ifError(removed.error);}
    const profiles=await service.from('profiles').select('*',{count:'exact',head:true}).in('id',users);assert.ifError(profiles.error);assert.equal(profiles.count,0);
    if(courseId){const courses=await service.from('courses').select('*',{count:'exact',head:true}).eq('id',courseId);assert.ifError(courses.error);assert.equal(courses.count,0);}
  }
});
