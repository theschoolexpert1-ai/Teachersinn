'use strict';
const {defineRepositoryContract}=require('../../data/repository-contract');const {DatabaseError}=require('../errors');
const contract=defineRepositoryContract('PostgreSQL jobs',['list','detail','apply','applications']);const uid=i=>String(i&&i.authUserId||'').trim();
function createPostgresJobsRepository({connection}){return contract.validate({
 async list(i,f={}){const q=String(f.q||''),subject=String(f.subject||''),city=String(f.city||''),type=String(f.type||'');return connection.withUserTransaction(i,db=>db.many(`select j.*,exists(select 1 from public.job_applications a where a.job_id=j.id and a.user_id=$1) applied,
 (select status from public.job_applications a where a.job_id=j.id and a.user_id=$1) application_status from public.jobs j where j.status='open'
 and ($2='' or j.title ilike '%'||$2||'%' or j.school ilike '%'||$2||'%' or j.subject ilike '%'||$2||'%' or j.city ilike '%'||$2||'%')
 and ($3='' or j.subject ilike '%'||$3||'%') and ($4='' or j.city ilike '%'||$4||'%') and ($5='' or j.job_type=$5)
 and (not $6::boolean or exists(select 1 from public.job_applications a where a.job_id=j.id and a.user_id=$1)) order by j.id desc`,[uid(i),q,subject,city,type,!!f.applied]),{readOnly:true});},
 async detail(i,id){return connection.withUserTransaction(i,async db=>{const row=await db.maybeOne(`select j.*,exists(select 1 from public.job_applications a where a.job_id=j.id and a.user_id=$1) applied,
 (select status from public.job_applications a where a.job_id=j.id and a.user_id=$1) application_status from public.jobs j where j.id=$2`,[uid(i),id]);if(!row)throw new DatabaseError(404,'Job not found.',{code:'NOT_FOUND'});return row;},{readOnly:true});},
 async apply(i,id){return connection.withUserTransaction(i,async db=>{if(!await db.maybeOne("select id from public.jobs where id=$1 and status='open'",[id]))throw new DatabaseError(409,'This job is no longer accepting applications.',{code:'JOB_CLOSED'});const me=uid(i);const inserted=await db.maybeOne(`insert into public.job_applications(user_id,job_id) values($1,$2) on conflict(user_id,job_id) do nothing returning id,user_id,job_id,status,applied_at,updated_at`,[me,id]);if(inserted)return inserted;throw new DatabaseError(409,'You have already applied for this job.',{code:'DUPLICATE_APPLICATION'});});},
 async applications(i){return connection.withUserTransaction(i,db=>db.many(`select a.id,a.status,a.applied_at,a.updated_at,j.id job_id,j.title,j.school,j.city,j.job_type,j.subject,j.status job_status
 from public.job_applications a join public.jobs j on j.id=a.job_id where a.user_id=$1 order by a.id desc`,[uid(i)]),{readOnly:true});},
});}module.exports={jobsContract:contract,createPostgresJobsRepository};

