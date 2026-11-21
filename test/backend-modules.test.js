'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthService } = require('../backend/src/services/auth.service');
const { createLearningService } = require('../backend/src/services/learning.service');
const { createMessagingService } = require('../backend/src/services/messaging.service');
const { createAdminService } = require('../backend/src/services/admin.service');
const { createLearningRepository } = require('../backend/src/repositories/learning.repository');
const { createMessagingRepository } = require('../backend/src/repositories/messaging.repository');
const { createWorkshopsService } = require('../backend/src/services/workshops.service');
const { createCommunityService } = require('../backend/src/services/community.service');
const { createSupportService } = require('../backend/src/services/support.service');
const { createMentorshipService } = require('../backend/src/services/mentorship.service');
const { createActivityRepository } = require('../backend/src/repositories/activity.repository');
const { createProfilesService } = require('../backend/src/services/profiles.service');
const { createSettingsService } = require('../backend/src/services/settings.service');
const { createNotificationsService } = require('../backend/src/services/notifications.service');
const { categoryFor, OPTIONAL_CATEGORIES } = require('../backend/src/notifications/categories');
const { createCareersService } = require('../backend/src/services/careers.service');
const { createLessonPlansService } = require('../backend/src/services/lesson-plans.service');
const { createTutorialsService } = require('../backend/src/services/tutorials.service');
const { createDashboardService } = require('../backend/src/services/dashboard.service');
const { workshopCalendar } = require('../backend/src/utils/workshop-calendar');
const { registerDashboardRoutes } = require('../backend/src/routes/dashboard.routes');
const { registerCommunityRoutes } = require('../backend/src/routes/community.routes');
const { createAuthAdapter } = require('../backend/src/http/auth-adapter');
const { registerAuthRoutes } = require('../backend/src/routes/auth.routes');
const { registerAdminRoutes } = require('../backend/src/routes/admin.routes');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function transactionSpy(events) {
  return (operation) => {
    events.push('begin');
    try { const result = operation(); events.push('commit'); return result; }
    catch (error) { events.push('rollback'); throw error; }
  };
}

test('authentication service owns registration transaction and returns a session only after writes', () => {
  const events = [];
  const repository = {
    findUserByEmail: () => null,
    createUser: () => { events.push('user'); return { lastInsertRowid: 42 }; },
    createSession: () => events.push('session'),
  };
  const service = createAuthService({
    repository,
    security: { randomToken: (n) => `token-${n}`, sha256: (v) => `hash-${v}`, hashPassword: () => 'password-hash' },
    tx: transactionSpy(events), audit: () => events.push('audit'), notify: () => events.push('notify'),
    nowIso: () => '2026-11-16T00:00:00.000Z', clientIp: () => '127.0.0.1', sessionAbsoluteMs: 1000,
    lockAfter: 5, lockMs: 1000, HttpError,
  });
  const token = service.register({ req: { headers: {} }, ip: '127.0.0.1' }, {
    name: 'Teacher', email: 'teacher@example.test', password: 'safe', designation: '', school: '', subjects: '',
  });
  assert.equal(token, 'token-32');
  assert.deepEqual(events, ['begin', 'user', 'audit', 'notify', 'session', 'commit']);
});

test('learning service keeps certificate issuance and notification in one rollback boundary', () => {
  const events = [];
  const repository = {
    findLesson: () => ({ id: 8, course_id: 3 }), findEnrollment: () => ({ completed_at: null }),
    markLessonComplete: () => events.push('progress'), countIncomplete: () => 0,
    completeEnrollment: () => events.push('certificate'), courseTitle: () => ({ title: 'Inclusive Teaching' }),
  };
  const service = createLearningService({
    repository, tx: transactionSpy(events), notify: () => { events.push('notify'); throw new Error('notification failed'); },
    audit: () => events.push('audit'), nowIso: () => 'now', randomCertificate: () => 'TIN-TEST', HttpError,
  });
  assert.throws(() => service.completeLesson({ user: { id: 9 }, ip: '127.0.0.1' }, 8), /notification failed/);
  assert.deepEqual(events, ['begin', 'progress', 'certificate', 'notify', 'rollback']);
});

test('messaging service enforces eligibility and coordinates message plus notification atomically', () => {
  const denied = createMessagingService({
    repository: { canMessage: () => false }, tx: (fn) => fn(), notify: () => {}, publicUser: () => ({ id: 2 }),
    directoryVisible: () => true, nowIso: () => 'now', HttpError,
  });
  assert.throws(() => denied.sendMessage({ user: { id: 1 } }, 2, 'Hello'), (error) => error.status === 403);

  const events = [];
  const allowed = createMessagingService({
    repository: { canMessage: () => true, insertMessage: () => events.push('message') },
    tx: transactionSpy(events), notify: () => events.push('notify'), publicUser: () => ({ id: 2 }),
    directoryVisible: () => true, nowIso: () => 'now', HttpError,
  });
  assert.deepEqual(allowed.sendMessage({ user: { id: 1, name: 'Asha' } }, 2, 'Hello'), { ok: true });
  assert.deepEqual(events, ['begin', 'message', 'notify', 'commit']);
});

test('administrator service rejects self-management and audits sensitive updates in the transaction', () => {
  const repository = { findUser: () => ({ id: 5, role: 'educator', status: 'active' }) };
  const service = createAdminService({ repository, tx: (fn) => fn(), audit: () => {}, HttpError });
  assert.throws(() => service.updateUser({ user: { id: 5 } }, 5, 'admin', 'active', false), (error) => error.status === 400);

  const events = [];
  repository.updateUser = () => events.push('update');
  repository.deleteUserSessions = () => events.push('sessions');
  const audited = createAdminService({ repository, tx: transactionSpy(events), audit: () => events.push('audit'), HttpError });
  assert.deepEqual(audited.updateUser({ user: { id: 1 }, ip: '127.0.0.1' }, 5, 'mentor', 'suspended', true), { ok: true });
  assert.deepEqual(events, ['begin', 'update', 'sessions', 'audit', 'commit']);
});

test('learning repository preserves parameter binding, owner filters and deterministic ordering', () => {
  const calls = [];
  const repository = createLearningRepository({
    all: (sql, ...params) => { calls.push({ sql, params }); return []; },
    get: (sql, ...params) => { calls.push({ sql, params }); return null; }, run: () => ({}),
  });
  repository.listCourseLessons(17, 4);
  assert.deepEqual(calls[0].params, [17, 4]);
  assert.match(calls[0].sql, /p\.user_id=\?/);
  assert.match(calls[0].sql, /l\.course_id=\?/);
  assert.match(calls[0].sql, /ORDER BY l\.position/);
});

test('messaging repository keeps participant scoping, bounded history and bound message writes', () => {
  const calls = [];
  const repository = createMessagingRepository({
    all: (sql, ...params) => { calls.push({ kind: 'all', sql, params }); return []; },
    get: () => null,
    run: (sql, ...params) => { calls.push({ kind: 'run', sql, params }); return {}; },
  });
  repository.listMessages(3, 7);
  repository.insertMessage(3, 7, 'Private message');
  assert.deepEqual(calls[0].params, [3, 7, 7, 3]);
  assert.match(calls[0].sql, /LIMIT 200/);
  assert.deepEqual(calls[1].params, [3, 7, 'Private message']);
  assert.match(calls[1].sql, /VALUES \(\?,\?,\?\)/);
});

test('workshop attendance coordinates state, audit and notification in one transaction', () => {
  const events=[]; const repository={find:()=>({title:'Past workshop',starts_at:'2020-01-01T00:00:00.000Z',duration_min:60}),registration:()=>({attendance_status:'pending'}),updateAttendance:()=>events.push('attendance')};
  const service=createWorkshopsService({repository,tx:transactionSpy(events),notify:()=>events.push('notify'),audit:()=>events.push('audit'),nowIso:()=> '2026-11-16T00:00:00.000Z',HttpError});
  assert.equal(service.attendance({user:{id:1},ip:'local'},2,3,'attended').changed,true);
  assert.deepEqual(events,['begin','attendance','audit','notify','commit']);
});

test('community reply rolls back when its linked notification fails', () => {
  const events=[]; const repository={post:()=>({user_id:2,title:'Discussion'}),duplicateReply:()=>null,createReply:()=>{events.push('reply');return{lastInsertRowid:9};}};
  const service=createCommunityService({repository,tx:transactionSpy(events),notify:()=>{events.push('notify');throw new Error('fail');},audit:()=>{},HttpError});
  assert.throws(()=>service.reply({user:{id:1,name:'Teacher'}},4,'Helpful reply'),/fail/);
  assert.deepEqual(events,['begin','reply','notify','rollback']);
});

test('support service preserves ticket ownership, closed state and atomic staff replies', () => {
  const closed=createSupportService({repository:{ticket:()=>({id:4,user_id:1,status:'closed'})},tx:(fn)=>fn(),notify:()=>{},audit:()=>{},nowIso:()=> 'now',HttpError});
  assert.throws(()=>closed.reply({user:{id:1,role:'educator'}},4,'Reply'),e=>e.status===409);
  const events=[]; const repository={ticket:()=>({id:4,user_id:1,status:'open',subject:'Help'}),addReply:()=>events.push('reply'),updateReplyState:()=>events.push('status')};
  const service=createSupportService({repository,tx:transactionSpy(events),notify:()=>events.push('notify'),audit:()=>{},nowIso:()=> 'now',HttpError});
  service.reply({user:{id:8,role:'admin'}},4,'Staff response');
  assert.deepEqual(events,['begin','reply','status','notify','commit']);
});

test('mentorship service enforces transition ownership and lifecycle', () => {
  const denied=createMentorshipService({repository:{forMentor:()=>null},tx:(fn)=>fn(),notify:()=>{},HttpError,publicUserColumns:'id'});
  assert.throws(()=>denied.respond({user:{id:2}},7,'accept'),e=>e.status===404);
  const service=createMentorshipService({repository:{forMentor:()=>({id:7,mentee_id:3,status:'completed'})},tx:(fn)=>fn(),notify:()=>{},HttpError,publicUserColumns:'id'});
  assert.throws(()=>service.respond({user:{id:2}},7,'complete'),e=>e.status===409);
});

test('shared activity repository binds audit and notification writes without independent commits', () => {
  const calls=[];const activity=createActivityRepository({get:()=>({enabled:1}),run:(sql,...params)=>{calls.push({sql,params});}});
  activity.audit(4,'admin.change','safe detail','127.0.0.1');activity.notify(5,'Message','#/support');
  assert.deepEqual(calls[0].params,[4,'admin.change','safe detail','127.0.0.1']);
  assert.deepEqual(calls[1].params,[5,'Message','#/support']);
});

test('profile service exports only safe profile data and transactionally deletes accounts', () => {
  const events=[]; const repository={exportData:()=>({posts:[]}),adminCount:()=>2,deleteUser:()=>events.push('delete')};
  const service=createProfilesService({repository,security:{verifyPassword:()=>true},tx:transactionSpy(events),audit:()=>events.push('audit'),nowIso:()=> 'now',safeUser:(u)=>({id:u.id,email:u.email}),HttpError});
  const ctx={user:{id:4,email:'teacher@test',password_hash:'secret',role:'educator'},ip:'local'};
  assert.deepEqual(service.export(ctx).profile,{id:4,email:'teacher@test'});
  service.deleteAccount(ctx,'password'); assert.deepEqual(events,['audit','begin','delete','audit','commit']);
});

test('account deletion rejects a bad password before starting a transaction', () => {
  let began=false; const service=createProfilesService({repository:{},security:{verifyPassword:()=>false},tx:()=>{began=true;},audit:()=>{},nowIso:()=> 'now',safeUser:u=>u,HttpError});
  assert.throws(()=>service.deleteAccount({user:{password_hash:'hash'}},'bad'),e=>e.status===400); assert.equal(began,false);
});

test('settings service preserves notification defaults and normalized updates', () => {
  let saved; const repository={hasCareerProfile:()=>false,preferences:()=>null,savePreferences:(u,k,v)=>{saved={u,k,v};}};
  const service=createSettingsService({repository,audit:()=>{},preferenceKeys:OPTIONAL_CATEGORIES}); const user={id:2,name:'T',email:'t@test',role:'educator',status:'active'};
  assert.ok(Object.values(service.overview(user).notifications).every(v=>v===1));
  const result=service.updateNotifications({user,body:{messages:false},ip:'local'},{messages:false}); assert.equal(result.notifications.messages,0); assert.equal(saved.u,2);
});

test('notification service preserves ownership results, pagination and idempotent reads', () => {
  const repository={unread:()=>2,preview:()=>[],total:()=>21,counts:()=>[{category:'system',n:21}],page:()=>[],markOne:()=>({changes:1}),markAll:()=>({changes:2})};
  const service=createNotificationsService({repository,nowIso:()=> 'now',HttpError}); const page=service.list(7,'all','all',2);
  assert.equal(page.page,2);assert.equal(page.pages,2);assert.equal(page.unread,2);assert.deepEqual(service.markOne(7,3),{ok:true,unread:2});assert.deepEqual(service.markAll(7),{ok:true,updated:2,unread:0});
});

test('notification category mapping remains authoritative and system notices essential', () => {
  assert.equal(categoryFor('#/messages/4'),'messages'); assert.equal(categoryFor('#/workshops'),'workshops'); assert.equal(categoryFor('#/unknown'),''); assert.equal(categoryFor('', 'mentorship'),'mentorship');
});

test('career application service keeps application and audit in one transaction', () => {
  const events=[];const repository={job:()=>({id:3,status:'open'}),application:()=>null,apply:()=>{events.push('application');return{lastInsertRowid:8};}};
  const service=createCareersService({repository,tx:transactionSpy(events),audit:()=>events.push('audit'),nowIso:()=> 'now',HttpError});
  assert.deepEqual(service.apply({user:{id:2},ip:'local'},3),{ok:true,id:8,status:'applied'});assert.deepEqual(events,['begin','application','audit','commit']);
});

test('lesson-plan service passes authenticated ownership to every private operation', () => {
  const calls=[];const repository={find:(u,id)=>{calls.push([u,id]);return{id,title:'Plan'};},update:(u,id)=>{calls.push([u,id]);return{changes:1};},delete:(u,id)=>{calls.push([u,id]);return{changes:1};}};
  const service=createLessonPlansService({repository,HttpError});service.detail(9,4);service.update(9,4,{});service.delete(9,4);assert.deepEqual(calls,[[9,4],[9,4],[9,4]]);
});

test('tutorial service preserves toggle semantics and rejects missing tutorials', () => {
  let saved=0;const repository={find:(id)=>id===1?{id:1}:null,toggle:()=>{saved=1-saved;},saved:()=>({saved})};const service=createTutorialsService({repository,HttpError});
  assert.deepEqual(service.toggle(5,1),{ok:true,saved:1});assert.deepEqual(service.toggle(5,1),{ok:true,saved:0});assert.throws(()=>service.toggle(5,99),e=>e.status===404);
});

test('dashboard service preserves scoped aggregates and eight-week activity shape', () => {
  const scalarCalls=[];const repository={courseCpd:()=>3,workshopCpd:()=>2,weekly:()=>[],scalar:(sql,...params)=>{scalarCalls.push({sql,params});return 0;},learning:()=>[],upcoming:()=>[],todayPlans:()=>[],discussions:()=>[],notifications:()=>[]};
  const service=createDashboardService({repository,nowIso:()=> '2026-11-17T00:00:00.000Z',nowMs:()=>Date.parse('2026-11-17T00:00:00.000Z'),cpdGoal:50});
  const result=service.overview(7);assert.deepEqual(result.cpd,{courses:3,workshops:2,total:5,goal:50});assert.equal(result.activity.length,8);assert.ok(scalarCalls.every(call=>call.params.includes(7)));
});

test('administrator publishing commits records and audit together and rolls back on audit failure', () => {
  const events=[];const repository={createJob:()=>{events.push('job');return{lastInsertRowid:4};}};
  const service=createAdminService({repository,tx:transactionSpy(events),audit:()=>{events.push('audit');throw new Error('audit failed');},HttpError});
  assert.throws(()=>service.createJob({user:{id:1},ip:'local'},{title:'Role'}),/audit failed/);assert.deepEqual(events,['begin','job','audit','rollback']);
});

test('workshop calendar preserves UTC serialization and escapes event text', () => {
  const value=workshopCalendar({id:3,title:'Math, Science',description:'Line 1\nLine 2',facilitator:'A; B',location:'Online',starts_at:'2026-12-01T10:00:00.000Z',duration_min:90},new Date('2026-11-17T00:00:00.000Z'));
  assert.match(value,/DTSTART:20261201T100000Z/);assert.match(value,/DTEND:20261201T113000Z/);assert.match(value,/SUMMARY:Math\\, Science/);assert.match(value,/DESCRIPTION:Line 1\\nLine 2/);
});

test('legacy session loading rejects expired and suspended identities and touches valid sessions', () => {
  const now=Date.now();let deleted=0;let touched=0;const base={token_hash:'hash',user_id:2,last_seen:now-61000,expires_at:now+100000};
  const repository={findSession:()=>base,findUserById:()=>({id:2,status:'active'}),deleteSession:()=>{deleted++;},touchSession:()=>{touched++;}};
  const service=createAuthService({repository,security:{sha256:()=> 'hash'},sessionIdleMs:12*60*60*1000});assert.equal(service.loadLegacySession('token').user.id,2);assert.equal(touched,1);
  repository.findUserById=()=>({id:2,status:'suspended'});assert.equal(service.loadLegacySession('token'),null);assert.equal(deleted,1);
  repository.findSession=()=>({...base,expires_at:now-1});assert.equal(service.loadLegacySession('token'),null);assert.equal(deleted,2);
});

test('dashboard and community route modules register through the central route convention', () => {
  const routes=[];const route=(method,path,access,handler)=>routes.push({method,path,access,handler});
  registerDashboardRoutes({route,dashboardService:{overview:()=>({})}});
  registerCommunityRoutes({route,communityService:{},security:{},id:Number});
  assert.deepEqual(routes.map(({method,path,access})=>[method,path,access]),[
    ['GET','/api/dashboard','user'],['GET','/api/communities','user'],['GET','/api/discussions','user'],['GET','/api/communities/:id/posts','user'],['POST','/api/communities/:id/posts','user'],['GET','/api/posts/:id','user'],['POST','/api/posts/:id/replies','user'],['DELETE','/api/replies/:id','user'],['DELETE','/api/posts/:id','user'],
  ]);
});

test('HTTP authentication adapter preserves cookie establishment and clearing',()=>{const cookies=[];const service={register:()=> 'registered',login:()=> 'logged-in',logout:()=>{}};const adapter=createAuthAdapter({runtime:{mode:'legacy',bridge:{}},service,setCookie:(res,req,value,age)=>cookies.push([value,age]),sessionMaxAge:99});const ctx={req:{},res:{}};assert.deepEqual(adapter.register(ctx,{}),{ok:true});assert.deepEqual(adapter.login(ctx,'a','b'),{ok:true});assert.deepEqual(adapter.logout(ctx),{ok:true});assert.deepEqual(cookies,[['registered',99],['logged-in',99],['',0]]);});

test('authentication route module registers the exact protected and public contracts',()=>{const routes=[];registerAuthRoutes({route:(method,path,access,handler)=>routes.push({method,path,access,handler}),adapter:{},security:{},HttpError,safeUser:u=>u,cpdGoal:50});assert.equal(routes.length,10);assert.deepEqual(routes.map(({method,path,access})=>[method,path,access]),[['GET','/api/me','public'],['POST','/api/auth/register','public'],['POST','/api/auth/login','public'],['POST','/api/auth/logout','user'],['POST','/api/auth/password','user'],['POST','/api/auth/recover','public'],['POST','/api/auth/verify','public'],['POST','/api/auth/reset-password','public'],['GET','/api/auth/sessions','user'],['POST','/api/auth/logout-others','user']]);});

test('administrator route module registers only administrator contracts',()=>{const routes=[];registerAdminRoutes({route:(method,path,access,handler)=>routes.push({method,path,access,handler}),admin:{},support:{},security:{},id:Number});assert.equal(routes.length,18);assert.ok(routes.every(route=>route.access==='admin'));assert.equal(new Set(routes.map(route=>`${route.method} ${route.path}`)).size,18);});
