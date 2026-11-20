'use strict';
const {defineRepositoryContract}=require('../../data/repository-contract');const {DatabaseError}=require('../errors');
const contract=defineRepositoryContract('PostgreSQL admin workshops',['create','list','registrations','attendance','remove']);
async function admin(db){if(!(await db.one('select public.is_admin() authorized',[])).authorized)throw new DatabaseError(403,'Administrator access is required.',{code:'FORBIDDEN'});}
function createPostgresAdminWorkshopsRepository({connection}){return contract.validate({
 async create(i,f){return connection.withUserTransaction(i,async db=>{await admin(db);return db.one(`insert into public.workshops(title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours,created_by)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[f.title,f.description,f.facilitator,f.category,f.mode,f.location,f.starts_at,f.duration_min,f.capacity,f.cpd_hours,i.authUserId]);});},
 async list(i){return connection.withUserTransaction(i,async db=>{await admin(db);return db.many(`select w.id,w.title,w.starts_at,w.duration_min,w.mode,w.location,w.cpd_hours,count(r.user_id)::integer registrations,
 count(*) filter(where r.attendance_status='pending')::integer pending,count(*) filter(where r.attendance_status='attended')::integer attended,count(*) filter(where r.attendance_status='absent')::integer absent
 from public.workshops w left join public.workshop_regs r on r.workshop_id=w.id group by w.id order by w.starts_at desc`,[]);},{readOnly:true});},
 async registrations(i,id,filters={}){return connection.withUserTransaction(i,async db=>{await admin(db);return db.many('select * from public.admin_workshop_registrations($1,$2,$3)',[id,filters.status||'',filters.search||'']);},{readOnly:true});},
 async attendance(i,w,u,status){return connection.withUserTransaction(i,async db=>{await admin(db);const row=await db.maybeOne('select * from public.set_workshop_attendance($1,$2,$3)',[w,u,status]);if(!row)throw new DatabaseError(404,'Workshop registration not found.',{code:'NOT_FOUND'});return row;});},
 async remove(i,id){return connection.withUserTransaction(i,async db=>{await admin(db);return{ok:true,deleted:(await db.execute('delete from public.workshops where id=$1',[id]))>0};});},
});}module.exports={adminWorkshopsContract:contract,createPostgresAdminWorkshopsRepository};

