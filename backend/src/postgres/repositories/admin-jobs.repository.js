'use strict';
const {defineRepositoryContract}=require('../../data/repository-contract');const {DatabaseError}=require('../errors');const contract=defineRepositoryContract('PostgreSQL admin jobs',['create','list','close']);
async function admin(db){if(!(await db.one('select public.is_admin() authorized',[])).authorized)throw new DatabaseError(403,'Administrator access is required.',{code:'FORBIDDEN'});}
function createPostgresAdminJobsRepository({connection}){return contract.validate({
 async create(i,f){return connection.withUserTransaction(i,async db=>{await admin(db);return db.one(`insert into public.jobs(title,school,city,job_type,subject,description,apply_email,posted_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[f.title,f.school,f.city,f.job_type,f.subject,f.description,f.apply_email,i.authUserId]);});},
 async list(i){return connection.withUserTransaction(i,async db=>{await admin(db);return db.many(`select j.id,j.title,j.school,j.city,j.job_type,j.subject,j.status,j.created_at,count(a.id)::integer applications from public.jobs j left join public.job_applications a on a.job_id=j.id group by j.id order by j.id desc`,[]);},{readOnly:true});},
 async close(i,id){return connection.withUserTransaction(i,async db=>{await admin(db);const row=await db.maybeOne("update public.jobs set status='closed' where id=$1 returning *",[id]);if(!row)throw new DatabaseError(404,'Job not found.',{code:'NOT_FOUND'});return row;});},
});}module.exports={adminJobsContract:contract,createPostgresAdminJobsRepository};
