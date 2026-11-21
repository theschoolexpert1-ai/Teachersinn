'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const routeInventory=require('./fixtures/route-inventory.json');
const { runWithPostgresIdentity,currentPostgresIdentity,createPostgresHttpServices,routeCollector,createIsolatedPostgresHttpHarness,createPostgresRouteComposition,resourceId,userId,createPostgresAccountDeletion,createPostgresAdminReportingRepository }=require('../backend/src/postgres');

const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const session=(id=A,role='educator')=>({csrf_token:'stage3h-csrf',identity:{authUser:{id},account:{role,status:'active'}},user:{id,role,name:'Stage 3H'}});

test('request identity is server-verified, request-scoped and rejects suspension',async()=>{
  await runWithPostgresIdentity(session(),async()=>assert.deepEqual(currentPostgresIdentity(),{authUserId:A,verified:true}));
  assert.throws(()=>currentPostgresIdentity(),/unavailable/);
  const suspended=session();suspended.identity.account.status='suspended';
  assert.throws(()=>runWithPostgresIdentity(suspended,()=>{}),/active/);
});

function repositories(calls){
  const fn=name=>(...args)=>{calls.push([name,...args]);return Promise.resolve({name});};
  return new Proxy({}, {get(_target,domain){return new Proxy({}, {get(_repo,method){return fn(`${String(domain)}.${String(method)}`);}});}});
}

test('service facade awaits PostgreSQL repositories and never trusts a different user UUID',async()=>{
  const calls=[],services=createPostgresHttpServices({repositories:repositories(calls)});
  await runWithPostgresIdentity(session(),()=>services.learning.listCourses(A));
  assert.equal(calls[0][0],'learning.listCourses');
  assert.deepEqual(calls[0][1],{authUserId:A,verified:true});
  await assert.rejects(async()=>runWithPostgresIdentity(session(),()=>services.learning.listCourses(B)),error=>error.status===403);
});

test('account deletion fails closed without explicit Auth administration dependencies',async()=>{
  const services=createPostgresHttpServices({repositories:repositories([])});
  await assert.rejects(async()=>runWithPostgresIdentity(session(),()=>services.profiles.deleteAccount()),error=>error.status===501);
});

test('all 98 route contracts compose unchanged with separate UUID and bigint validators',()=>{
  const noop=()=>({});const domain=new Proxy({}, {get:()=>noop});const services=new Proxy({}, {get:()=>domain});
  const authAdapter={register:noop,login:noop,logout:noop,clear:noop,mode:()=> 'supabase',bridge:new Proxy({}, {get:()=>noop}),service:new Proxy({}, {get:()=>noop})};
  const composition=createPostgresRouteComposition({services,authAdapter});
  assert.deepEqual(composition.inventory,routeInventory);assert.equal(composition.routes.length,98);
  assert.equal(resourceId('42'),42);assert.throws(()=>resourceId(A));assert.equal(userId(A),A);assert.throws(()=>userId('42'));
});

test('administrator reporting preserves analytics, mentorship and audit response boundaries',async()=>{
  const calls=[];const db={one:async(sql,values=[])=>{calls.push(['one',sql,values]);if(sql.includes('is_admin'))return{authorized:true};if(sql.includes('period,'))return{period:'30',enrollments:1,completions:1,certificates:1,workshopRegistrations:1,attended:1,discussions:1,replies:1,jobs:1,applications:1,connections:1,acceptedConnections:1};if(sql.includes('count(*)::integer n'))return{n:2};return{id:1};},many:async(sql,values=[])=>{calls.push(['many',sql,values]);return[];},maybeOne:async()=>({role:'educator',status:'active'})};
  const connection={withUserTransaction:async(_i,work)=>work(db)};const repository=createPostgresAdminReportingRepository({connection}),i={authUserId:A,verified:true};
  assert.equal((await repository.analytics(i,'30')).period,'30');assert.deepEqual(await repository.mentorships(i),[]);
  assert.deepEqual(await repository.auditLog(i,'login',2),{items:[],total:2,page:2,pages:1});assert.deepEqual(await repository.recentAudit(i),[]);
  assert.ok(calls.every(call=>!call[1].includes('auth.users')));
});

test('account deletion verifies password, prepares retained audit, then invokes only the captured Auth identity',async()=>{
  const order=[];const reporting={prepareAccountDeletion:async(i)=>{order.push('prepare');return{authorized:true,authUserId:i.authUserId};}};
  const deletion=createPostgresAccountDeletion({reporting,verifyCurrentPassword:async(_s,p)=>{order.push('verify');return p==='correct';},deleteAuthUser:async id=>{order.push(`delete:${id}`);}});
  await assert.rejects(()=>deletion.deleteOwn({session:session(),ip:'127.0.0.1'},'wrong'),error=>error.status===400);assert.deepEqual(order,['verify']);order.length=0;
  assert.deepEqual(await deletion.deleteOwn({session:session(),ip:'127.0.0.1'},'correct'),{ok:true});assert.deepEqual(order,['verify','prepare',`delete:${A}`]);
});

test('pending HTTP compatibility migration is additive and narrowly privileged',()=>{
  const sql=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611190009_http_compatibility_security.sql'),'utf8');
  assert.match(sql,/create policy mentorships_admin_read/i);assert.match(sql,/security definer/i);assert.match(sql,/set search_path = ''/i);
  assert.match(sql,/auth\.uid\(\)/i);assert.match(sql,/last active administrator cannot be deleted/i);assert.match(sql,/revoke all on function/i);assert.match(sql,/grant execute .* to authenticated/i);
  assert.doesNotMatch(sql,/drop\s+(table|schema)|truncate|delete\s+from/i);
  const acl=fs.readFileSync(path.join(__dirname,'..','supabase','migrations','202611190010_fix_account_deletion_function_acl.sql'),'utf8');
  assert.match(acl,/revoke execute on function public\.prepare_own_account_deletion\(inet\) from anon/i);
  assert.match(acl,/revoke execute on function public\.prepare_own_account_deletion\(inet\) from service_role/i);
  assert.match(acl,/revoke execute on function public\.prepare_own_account_deletion\(inet\) from public/i);
  assert.match(acl,/grant execute on function public\.prepare_own_account_deletion\(inet\) to authenticated/i);
  assert.doesNotMatch(acl,/\b(drop|delete|truncate|alter table|create table|create policy)\b/i);
});

test('isolated harness binds loopback, enforces authentication, CSRF, origin and admin access',async(t)=>{
  const {route,routes}=routeCollector();
  route('GET','/api/public','public',()=>({public:true}));
  route('GET','/api/private','user',()=>({id:currentPostgresIdentity().authUserId}));
  route('POST','/api/private','user',ctx=>({value:ctx.body.value}));
  route('GET','/api/admin','admin',()=>({admin:true}));
  const harness=createIsolatedPostgresHttpHarness({routes,appOrigin:'http://127.0.0.1',loadSession:async req=>req.headers.authorization==='Bearer valid'?session():req.headers.authorization==='Bearer admin'?session(A,'admin'):null});
  await new Promise(resolve=>harness.server.listen(0,'127.0.0.1',resolve));t.after(()=>harness.shutdown());
  const address=harness.server.address();assert.equal(address.address,'127.0.0.1');const base=`http://127.0.0.1:${address.port}`;
  assert.equal((await fetch(base+'/api/public')).status,200);
  assert.equal((await fetch(base+'/api/private')).status,401);
  assert.equal((await fetch(base+'/api/private',{headers:{authorization:'Bearer valid'}})).status,200);
  assert.equal((await fetch(base+'/api/admin',{headers:{authorization:'Bearer valid'}})).status,403);
  assert.equal((await fetch(base+'/api/admin',{headers:{authorization:'Bearer admin'}})).status,200);
  assert.equal((await fetch(base+'/api/private',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json',origin:'http://127.0.0.1'},body:'{"value":1}'})).status,403);
  assert.equal((await fetch(base+'/api/private',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json',origin:'https://evil.test','x-csrf-token':'stage3h-csrf'},body:'{"value":1}'})).status,403);
  assert.equal((await fetch(base+'/api/private',{method:'POST',headers:{authorization:'Bearer valid','content-type':'application/json',origin:'http://127.0.0.1','x-csrf-token':'stage3h-csrf'},body:'{"value":1}'})).status,200);
  await harness.shutdown();assert.equal(harness.server.listening,false);
});
