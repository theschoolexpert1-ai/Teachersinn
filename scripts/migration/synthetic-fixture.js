'use strict';
const fs=require('node:fs');const path=require('node:path');const{DatabaseSync}=require('node:sqlite');const{migrateDatabase}=require('../../src/migrations');
const CREATED='2026-10-01 09:00:00';
const identities=Object.freeze([
  {legacy_user_id:101,auth_user_id:'10000000-0000-4000-8000-000000000101',normalized_email:'stage3i.teacher@example.test',approved_role:'educator',identity_key:'teacher'},
  {legacy_user_id:102,auth_user_id:'10000000-0000-4000-8000-000000000102',normalized_email:'stage3i.mentor@example.test',approved_role:'mentor',identity_key:'mentor'},
  {legacy_user_id:103,auth_user_id:'10000000-0000-4000-8000-000000000103',normalized_email:'stage3i.admin@example.test',approved_role:'admin',identity_key:'administrator'},
]);
const manifest=()=>({version:1,fixture:'teachersinn-stage3i-synthetic-v1',identities:identities.map(x=>({...x}))});
function createSyntheticFixture(file){
  const resolved=path.resolve(file);if(fs.existsSync(resolved))throw new Error('Synthetic fixture target already exists.');fs.mkdirSync(path.dirname(resolved),{recursive:true});const db=new DatabaseSync(resolved);
  try{db.exec('pragma foreign_keys=on');migrateDatabase(db);db.exec('begin immediate');
    const u=db.prepare(`insert into users(id,name,email,password_hash,role,status,designation,school,subjects,grades,board,city,state,bio,experience_years,open_to_mentor,directory_visible,consent_at,consent_version,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    u.run(101,'Synthetic Teacher',identities[0].normalized_email,'synthetic-disabled-hash','educator','active','Teacher','Synthetic Academy','Science','8','CBSE','Test City','Test State','Invented fixture',4,0,1,CREATED,'1.0',CREATED);
    u.run(102,'Synthetic Mentor',identities[1].normalized_email,'synthetic-disabled-hash','mentor','active','Senior Teacher','Synthetic Academy','Mathematics','9','CBSE','Test City','Test State','Invented fixture',9,1,1,CREATED,'1.0',CREATED);
    u.run(103,'Synthetic Administrator',identities[2].normalized_email,'synthetic-disabled-hash','admin','active','Platform Administrator','TeachersInn Test','Administration','','','Test City','Test State','Invented fixture',10,0,0,CREATED,'1.0',CREATED);
    db.prepare(`insert into courses(id,title,category,level,summary,instructor,cpd_hours,published,created_at,description,thumbnail,objectives,prerequisites,estimated_minutes,status,updated_at) values(201,'Synthetic Science Course','Science','Beginner','Fixture course','Synthetic Mentor',2,1,?,'Fixture-only course','', 'Validate migration','None',30,'published',?)`).run(CREATED,CREATED);
    db.prepare(`insert into lessons(id,course_id,position,title,body,minutes) values(211,201,1,'Synthetic Lesson','Invented lesson content',30)`).run();
    db.prepare(`insert into enrollments(user_id,course_id,enrolled_at,completed_at,certificate_code) values(101,201,?,?,?)`).run(CREATED,CREATED,'SYNTH-STAGE3I-001');
    db.prepare(`insert into lesson_progress(user_id,lesson_id,done_at) values(101,211,?)`).run(CREATED);
    db.prepare(`insert into workshops(id,title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours,created_by,created_at) values(301,'Synthetic Workshop','Fixture workshop','Synthetic Mentor','Pedagogy','Online','Online',?,60,10,1,103,?)`).run('2026-10-10 10:00:00',CREATED);
    db.prepare(`insert into workshop_regs(user_id,workshop_id,registered_at,attended,attendance_status,attendance_verified_at,attendance_verified_by) values(101,301,?,1,'attended',?,103)`).run(CREATED,CREATED);
    db.prepare(`insert into jobs(id,title,school,city,job_type,subject,description,apply_email,posted_by,status,created_at) values(401,'Synthetic Teacher Role','Fixture School','Test City','Full-time','Science','Invented vacancy','stage3i.jobs@example.test',103,'open',?)`).run(CREATED);
    db.prepare(`insert into career_profiles(user_id,professional_summary,previous_institutions,responsibilities,qualifications,certifications,training,skills,specializations,cv_template,updated_at) values(101,'Synthetic summary','Fixture School','Teaching','B.Ed','Fixture Certificate','Fixture Training','Planning','Science','classic',?)`).run(CREATED);
    db.prepare(`insert into job_applications(id,user_id,job_id,status,applied_at,updated_at) values(411,101,401,'applied',?,?)`).run(CREATED,CREATED);
    db.prepare(`insert into connections(id,requester_id,addressee_id,status,created_at) values(501,101,102,'accepted',?)`).run(CREATED);
    db.prepare(`insert into messages(id,sender_id,recipient_id,body,created_at) values(511,101,102,'Synthetic private message',?)`).run(CREATED);
    db.prepare(`insert into communities(id,name,description,icon) values(601,'Synthetic Educators','Fixture community','S')`).run();
    db.prepare(`insert into posts(id,community_id,user_id,title,body,created_at) values(611,601,101,'Synthetic discussion','Invented discussion content',?)`).run(CREATED);
    db.prepare(`insert into replies(id,post_id,user_id,body,created_at) values(612,611,102,'Synthetic reply',?)`).run(CREATED);
    db.prepare(`insert into notifications(id,user_id,text,link,created_at) values(701,101,'Synthetic notification','#/learn',?)`).run(CREATED);
    db.prepare(`insert into notification_preferences(user_id,messages,connections,community,workshops,learning,mentorship,support,updated_at) values(101,1,1,1,1,1,1,1,?)`).run(CREATED);
    db.prepare(`insert into mentorships(id,mentee_id,mentor_id,topic,message,status,created_at) values(801,101,102,'Synthetic mentoring','Invented request','active',?)`).run(CREATED);
    db.prepare(`insert into tickets(id,user_id,category,subject,body,status,priority,created_at,updated_at) values(901,101,'Technical Issue','Synthetic ticket','Invented support request','open','normal',?,?)`).run(CREATED,CREATED);
    db.prepare(`insert into ticket_replies(id,ticket_id,user_id,body,created_at) values(911,901,103,'Synthetic administrator reply',?)`).run(CREATED);
    db.prepare(`insert into tutorials(id,title,category,summary,steps,minutes) values(1001,'Synthetic Tutorial','Testing','Fixture tutorial','["Open fixture","Validate output"]',5)`).run();
    db.prepare(`insert into tutorial_views(user_id,tutorial_id,saved,viewed_at) values(101,1001,1,?)`).run(CREATED);
    db.prepare(`insert into lesson_plans(id,user_id,title,subject,grade,plan_date,duration_min,objectives,materials,activities,assessment,reflection,created_at,updated_at) values(1101,101,'Synthetic Lesson Plan','Science','8','2026-10-05',40,'Fixture objective','Fixture materials','Fixture activity','Fixture assessment','',?,?)`).run(CREATED,CREATED);
    db.prepare(`insert into audit_log(id,user_id,action,detail,ip,created_at) values(1201,103,'stage3i.synthetic','Fixture-only audit',null,?)`).run(CREATED);
    db.exec('commit');return{path:resolved,identityCount:identities.length,applicationRecordCount:Number(db.prepare("select sum(n) total from (select count(*) n from users union all select count(*) from audit_log union all select count(*) from courses union all select count(*) from lessons union all select count(*) from enrollments union all select count(*) from lesson_progress union all select count(*) from workshops union all select count(*) from workshop_regs union all select count(*) from jobs union all select count(*) from career_profiles union all select count(*) from job_applications union all select count(*) from connections union all select count(*) from messages union all select count(*) from communities union all select count(*) from posts union all select count(*) from replies union all select count(*) from notifications union all select count(*) from notification_preferences union all select count(*) from mentorships union all select count(*) from tickets union all select count(*) from ticket_replies union all select count(*) from tutorials union all select count(*) from tutorial_views union all select count(*) from lesson_plans)").get().total)};
  }catch(error){try{db.exec('rollback')}catch{}try{db.close()}catch{}try{fs.rmSync(resolved,{force:true})}catch{}throw error;}finally{try{db.close()}catch{}}
}
module.exports={identities,manifest,createSyntheticFixture};
