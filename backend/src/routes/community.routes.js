'use strict';

function registerCommunityRoutes({route,communityService,security,id}) {
  route('GET','/api/communities','user',()=>communityService.communities());
  route('GET','/api/discussions','user',(ctx)=>{
    const q=security.str(ctx.query.get('q'),{field:'Search',max:100}).replace(/[%_]/g,'');
    const communityId=ctx.query.get('community')?id(ctx.query.get('community')):0;
    const mine=ctx.query.get('mine')==='1'?1:0;
    const sort=security.oneOf(ctx.query.get('sort')||'active',['active','recent','discussed'],'Sort');
    return communityService.discussions({q,communityId,mine,userId:ctx.user.id,sort});
  });
  route('GET','/api/communities/:id/posts','user',(ctx)=>communityService.communityPosts(id(ctx.params.id)));
  route('POST','/api/communities/:id/posts','user',(ctx)=>{
    const title=security.str(ctx.body.title,{field:'Title',min:5,max:150,required:true});
    const body=security.str(ctx.body.body,{field:'Post',min:10,max:5000,required:true});
    return communityService.createPost(ctx,id(ctx.params.id),title,body);
  });
  route('GET','/api/posts/:id','user',(ctx)=>communityService.postDetail(id(ctx.params.id)));
  route('POST','/api/posts/:id/replies','user',(ctx)=>{
    const body=security.str(ctx.body.body,{field:'Reply',min:2,max:3000,required:true});
    return communityService.reply(ctx,id(ctx.params.id),body);
  });
  route('DELETE','/api/replies/:id','user',(ctx)=>communityService.deleteReply(ctx,id(ctx.params.id)));
  route('DELETE','/api/posts/:id','user',(ctx)=>communityService.deletePost(ctx,id(ctx.params.id)));
}

module.exports = { registerCommunityRoutes };
