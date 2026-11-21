'use strict';
const {defineRepositoryContract}=require('../../data/repository-contract');
const {DatabaseError}=require('../errors');
const contract=defineRepositoryContract('PostgreSQL workshops',['list','detail','register','cancel','cpdSummary']);
const uid=i=>String(i&&i.authUserId||'').trim();
function createPostgresWorkshopsRepository({connection}){return contract.validate({
 async list(identity){return connection.withUserTransaction(identity,db=>db.many(`select w.*,public.workshop_registration_count(w.id) registered_count,
  (r.user_id is not null) registered,r.attended,r.registered_at,r.attendance_status,r.attendance_verified_at
  from public.workshops w left join public.workshop_regs r on r.workshop_id=w.id and r.user_id=$1 order by w.starts_at`,[uid(identity)]),{readOnly:true});},
 async detail(identity,id){return connection.withUserTransaction(identity,async db=>{const w=await db.maybeOne('select * from public.workshops where id=$1',[id]);if(!w)throw new DatabaseError(404,'Workshop not found.',{code:'NOT_FOUND'});const registration=await db.maybeOne('select * from public.workshop_regs where user_id=$1 and workshop_id=$2',[uid(identity),id]);return{workshop:w,registration};},{readOnly:true});},
 async register(identity,id){return connection.withUserTransaction(identity,async db=>{const row=await db.maybeOne('select * from public.register_for_workshop($1)',[id]);if(!row)throw new DatabaseError(404,'Workshop not found.',{code:'NOT_FOUND'});return row;});},
 async cancel(identity,id){return connection.withUserTransaction(identity,async db=>({ok:true,cancelled:(await db.execute('delete from public.workshop_regs where user_id=$1 and workshop_id=$2',[uid(identity),id]))>0}));},
 async cpdSummary(identity,year=new Date().getUTCFullYear()){return connection.withUserTransaction(identity,async db=>{const row=await db.one(`select coalesce(sum(w.cpd_hours),0)::integer hours,count(*)::integer workshops from public.workshop_regs r join public.workshops w on w.id=r.workshop_id
   where r.user_id=$1 and r.attendance_status='attended' and r.attendance_verified_at is not null
   and w.starts_at>=make_timestamptz($2,1,1,0,0,0,'UTC') and w.starts_at<make_timestamptz($2+1,1,1,0,0,0,'UTC')`,[uid(identity),year]);return{year,...row};},{readOnly:true});},
});}
module.exports={workshopsContract:contract,createPostgresWorkshopsRepository};

