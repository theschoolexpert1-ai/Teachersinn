'use strict';

const {defineRepositoryContract}=require('../../data/repository-contract');
const {DatabaseError}=require('../errors');
const contract=defineRepositoryContract('PostgreSQL administrator reporting',['analytics','mentorships','auditLog','recentAudit','prepareAccountDeletion']);
async function admin(db){if(!(await db.one('select public.is_admin() authorized',[])).authorized)throw new DatabaseError(403,'Administrator access is required.',{code:'FORBIDDEN'});}

function createPostgresAdminReportingRepository({connection}){return contract.validate({
  async analytics(i,period){const days=period==='all'?null:Number(period);return connection.withUserTransaction(i,async db=>{await admin(db);return db.one(`select $1::text period,
    (select count(*)::integer from public.enrollments where $2::integer is null or enrolled_at>=now()-$2*interval '1 day') enrollments,
    (select count(*)::integer from public.enrollments where completed_at is not null and ($2::integer is null or completed_at>=now()-$2*interval '1 day')) completions,
    (select count(*)::integer from public.enrollments where certificate_code is not null and ($2::integer is null or completed_at>=now()-$2*interval '1 day')) certificates,
    (select count(*)::integer from public.workshop_regs where $2::integer is null or registered_at>=now()-$2*interval '1 day') "workshopRegistrations",
    (select count(*)::integer from public.workshop_regs where attendance_status='attended' and ($2::integer is null or attendance_verified_at>=now()-$2*interval '1 day')) attended,
    (select count(*)::integer from public.posts where $2::integer is null or created_at>=now()-$2*interval '1 day') discussions,
    (select count(*)::integer from public.replies where $2::integer is null or created_at>=now()-$2*interval '1 day') replies,
    (select count(*)::integer from public.jobs where $2::integer is null or created_at>=now()-$2*interval '1 day') jobs,
    (select count(*)::integer from public.job_applications where $2::integer is null or applied_at>=now()-$2*interval '1 day') applications,
    (select count(*)::integer from public.connections where $2::integer is null or created_at>=now()-$2*interval '1 day') connections,
    (select count(*)::integer from public.connections where status='accepted' and ($2::integer is null or created_at>=now()-$2*interval '1 day')) "acceptedConnections"`,[period,days]);},{readOnly:true});},
  async mentorships(i){return connection.withUserTransaction(i,async db=>{await admin(db);return db.many(`select m.id,m.topic,m.status,m.created_at,mentee.name mentee,mentor.name mentor from public.mentorships m join public.profiles mentee on mentee.id=m.mentee_id join public.profiles mentor on mentor.id=m.mentor_id order by m.id desc limit 200`,[]);},{readOnly:true});},
  async auditLog(i,q,page){return connection.withUserTransaction(i,async db=>{await admin(db);const term=String(q||''),limit=50,offset=(Number(page)-1)*limit;const params=[term,limit,offset];const where=`($1='' or a.action ilike '%'||$1||'%' or a.detail ilike '%'||$1||'%' or coalesce(p.name,'') ilike '%'||$1||'%')`;const total=(await db.one(`select count(*)::integer n from public.audit_log a left join public.profiles p on p.id=a.user_id where ${where}`,[term])).n;const items=await db.many(`select a.*,p.name,null::text email from public.audit_log a left join public.profiles p on p.id=a.user_id where ${where} order by a.id desc limit $2 offset $3`,params);return{items,total,page:Number(page),pages:Math.max(1,Math.ceil(total/limit))};},{readOnly:true});},
  async recentAudit(i){return connection.withUserTransaction(i,async db=>{await admin(db);return db.many(`select a.*,p.name,null::text email from public.audit_log a left join public.profiles p on p.id=a.user_id order by a.id desc limit 300`,[]);},{readOnly:true});},
  async prepareAccountDeletion(i,ip=''){return connection.withUserTransaction(i,async db=>{const row=await db.one('select public.prepare_own_account_deletion($1::inet) auth_user_id',[ip||null]);return{authorized:true,authUserId:row.auth_user_id};});},
});}
module.exports={adminReportingContract:contract,createPostgresAdminReportingRepository};
