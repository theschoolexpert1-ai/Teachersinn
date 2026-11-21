'use strict';
const {defineRepositoryContract}=require('../../data/repository-contract');const {DatabaseError}=require('../errors');
const contract=defineRepositoryContract('PostgreSQL community moderation',['statistics','discussions','removePost','removeReply']);
async function admin(db){if(!(await db.one('select public.is_admin() authorized',[])).authorized)throw new DatabaseError(403,'Administrator access is required.',{code:'FORBIDDEN'});}
function createPostgresAdminCommunityRepository({connection}){return contract.validate({
 async statistics(i){return connection.withUserTransaction(i,async db=>{await admin(db);return db.one('select (select count(*)::integer from public.communities) communities,(select count(*)::integer from public.posts) posts,(select count(*)::integer from public.replies) replies',[]);},{readOnly:true});},
 async discussions(i){return connection.withUserTransaction(i,async db=>{await admin(db);return db.many(`select p.id,p.title,p.created_at,c.name community,u.name author,count(r.id)::integer replies from public.posts p join public.communities c on c.id=p.community_id join public.profiles u on u.id=p.user_id left join public.replies r on r.post_id=p.id group by p.id,c.id,u.id order by p.id desc limit 200`,[]);},{readOnly:true});},
 async removePost(i,id){return connection.withUserTransaction(i,async db=>{await admin(db);return{ok:true,deleted:(await db.one("select public.moderate_community('post',$1) deleted",[id])).deleted};});},
 async removeReply(i,id){return connection.withUserTransaction(i,async db=>{await admin(db);return{ok:true,deleted:(await db.one("select public.moderate_community('reply',$1) deleted",[id])).deleted};});},
});}module.exports={adminCommunityContract:contract,createPostgresAdminCommunityRepository};
