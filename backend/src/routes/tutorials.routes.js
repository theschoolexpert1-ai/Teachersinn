'use strict';
function registerTutorialRoutes({route,service,id}){
 route('GET','/api/tutorials','user',ctx=>service.list(ctx.user.id));
 route('GET','/api/tutorials/:id','user',ctx=>service.detail(ctx.user.id,id(ctx.params.id)));
 route('POST','/api/tutorials/:id/save','user',ctx=>service.toggle(ctx.user.id,id(ctx.params.id)));
}
module.exports={registerTutorialRoutes};
