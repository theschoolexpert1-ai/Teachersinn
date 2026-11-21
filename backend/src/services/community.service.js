'use strict';
function createCommunityService({repository,tx,notify,audit,HttpError}) { return {
  communities:()=>repository.communities(),
  discussions(filters){const order=filters.sort==='recent'?'p.id DESC':filters.sort==='discussed'?'replies DESC, last_activity DESC':'last_activity DESC, p.id DESC';return repository.discussions({...filters,order});},
  communityPosts(communityId){const community=repository.community(communityId);if(!community)throw new HttpError(404,'Community not found.');return{community,posts:repository.communityPosts(communityId)};},
  postDetail(postId){const post=repository.postDetail(postId);if(!post)throw new HttpError(404,'Post not found.');return{post,replies:repository.replies(postId)};},
  createPost(ctx,communityId,title,body){if(!repository.community(communityId)) throw new HttpError(404,'Community not found.'); const duplicate=repository.duplicatePost(communityId,ctx.user.id,title,body); if(duplicate)return{ok:true,id:duplicate.id,duplicate:true}; const r=repository.createPost(communityId,ctx.user.id,title,body);return{ok:true,id:Number(r.lastInsertRowid)};},
  reply(ctx,postId,body){const post=repository.post(postId);if(!post)throw new HttpError(404,'Post not found.');const duplicate=repository.duplicateReply(postId,ctx.user.id,body);if(duplicate)return{ok:true,id:duplicate.id,duplicate:true};return tx(()=>{const r=repository.createReply(postId,ctx.user.id,body);if(post.user_id!==ctx.user.id)notify(post.user_id,`${ctx.user.name} replied to "${post.title}".`,`#/post/${postId}`);return{ok:true,id:Number(r.lastInsertRowid)};});},
  deleteReply(ctx,replyId){const r=repository.reply(replyId);if(!r)throw new HttpError(404,'Reply not found.');if(r.user_id!==ctx.user.id&&ctx.user.role!=='admin')throw new HttpError(403,'You can only delete your own replies.');repository.deleteReply(replyId);audit(ctx.user.id,'reply.delete',`#${r.id} post=${r.post_id}`,ctx.ip);return{ok:true,postId:r.post_id};},
  deletePost(ctx,postId){const p=repository.post(postId);if(!p)throw new HttpError(404,'Post not found.');if(p.user_id!==ctx.user.id&&ctx.user.role!=='admin')throw new HttpError(403,'You can only delete your own posts.');repository.deletePost(postId);audit(ctx.user.id,'post.delete',`#${p.id}`,ctx.ip);return{ok:true};},
}; }
module.exports={createCommunityService};
