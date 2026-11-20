'use strict';
function registerNetworkingRoutes({route,service,security,id,userId=id}){
 route('GET','/api/educators','user',ctx=>{const q=security.str(ctx.query.get('q'),{field:'Search',max:60});const like=`%${q.replace(/[%_]/g,'')}%`;const view=security.oneOf(ctx.query.get('view')||'all',['all','connections','sent','received'],'Network view');const subject=security.str(ctx.query.get('subject'),{field:'Subject',max:60}).replace(/[%_]/g,'');const city=security.str(ctx.query.get('city'),{field:'City',max:60}).replace(/[%_]/g,'');return service.directory(ctx.user.id,{like,view,subject,city});});
 route('GET','/api/educators/:id','user',ctx=>service.educator(ctx.user.id,userId(ctx.params.id)));
 route('POST','/api/connections','user',ctx=>service.requestConnection(ctx,userId(ctx.body.user_id)));route('POST','/api/connections/:id/respond','user',ctx=>service.respondToConnection(ctx,id(ctx.params.id),security.oneOf(ctx.body.action,['accept','decline'],'Action')));route('DELETE','/api/connections/:id','user',ctx=>service.removeConnection(ctx,id(ctx.params.id)));route('GET','/api/connections','user',ctx=>service.connections(ctx.user.id));
 route('GET','/api/messages','user',ctx=>service.listConversations(ctx.user.id));route('GET','/api/messages/:userId','user',ctx=>service.getConversation(ctx,userId(ctx.params.userId)));route('POST','/api/messages/:userId','user',ctx=>service.sendMessage(ctx,userId(ctx.params.userId),security.str(ctx.body.body,{field:'Message',max:2000,required:true})));
}
module.exports={registerNetworkingRoutes};
