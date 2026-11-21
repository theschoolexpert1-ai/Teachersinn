'use strict';
const {defineRepositoryContract}=require('../../data/repository-contract');const {DatabaseError}=require('../errors');
const contract=defineRepositoryContract('PostgreSQL teacher discovery',['directory','educator']);const uid=i=>String(i&&i.authUserId||'').trim();
function createPostgresTeacherDiscoveryRepository({connection}){return contract.validate({
 async directory(i,f={}){const q=String(f.q||'').trim(),subject=String(f.subject||'').trim(),city=String(f.city||'').trim(),view=f.view||'all';return connection.withUserTransaction(i,db=>db.many(`select p.id,p.name,p.designation,p.school,p.subjects,p.grades,p.board,p.city,p.state,p.bio,p.experience_years,p.open_to_mentor,p.avatar_path,
 c.id connection_id,c.status connection_status,case when c.requester_id=$1 then 'out' when c.addressee_id=$1 then 'in' end direction
 from public.profiles p left join public.connections c on (c.requester_id=$1 and c.addressee_id=p.id) or (c.addressee_id=$1 and c.requester_id=p.id)
 where p.id<>$1 and p.directory_visible and public.is_active_account(p.id) and ($2='' or concat_ws(' ',p.name,p.subjects,p.city,p.state,p.school,p.designation) ilike '%'||$2||'%')
 and ($3='' or p.subjects ilike '%'||$3||'%') and ($4='' or p.city ilike '%'||$4||'%')
 and ($5='all' or ($5='connections' and c.status='accepted') or ($5='sent' and c.status='pending' and c.requester_id=$1) or ($5='received' and c.status='pending' and c.addressee_id=$1))
 order by p.open_to_mentor desc,p.experience_years desc,lower(p.name),p.id limit 100`,[uid(i),q,subject,city,view]),{readOnly:true});},
 async educator(i,id){return connection.withUserTransaction(i,async db=>{const p=await db.maybeOne('select * from public.network_profile($1)',[id]);if(!p)throw new DatabaseError(404,'Educator not found.',{code:'NOT_FOUND'});const c=await db.maybeOne(`select id connection_id,status,case when requester_id=$1 then 'out' else 'in' end direction from public.connections where (requester_id=$1 and addressee_id=$2) or (requester_id=$2 and addressee_id=$1)`,[uid(i),id]);return{...p,...(c||{connection_id:null,status:null,direction:null})};},{readOnly:true});},
});}module.exports={teacherDiscoveryContract:contract,createPostgresTeacherDiscoveryRepository};
