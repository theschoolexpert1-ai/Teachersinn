'use strict';
function registerNotificationRoutes({route,service,security,id,filterCategories}){
 route('GET','/api/notifications/preview','user',ctx=>service.preview(ctx.user.id));
 route('GET','/api/notifications','user',ctx=>{const state=security.oneOf(ctx.query.get('state')||'all',['all','unread','read'],'Read filter');const category=security.oneOf(ctx.query.get('category')||'all',filterCategories,'Notification category');const page=security.int(ctx.query.get('page'),{field:'Page',min:1,max:100000,def:1});return service.list(ctx.user.id,state,category,page);});
 route('POST','/api/notifications/:id/read','user',ctx=>service.markOne(ctx.user.id,id(ctx.params.id)));
 route('POST','/api/notifications/read','user',ctx=>service.markAll(ctx.user.id));
}
module.exports={registerNotificationRoutes};
