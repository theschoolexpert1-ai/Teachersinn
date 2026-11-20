'use strict';
function registerLessonPlanRoutes({route,service,security,id}){
 function fields(b){return{title:security.str(b.title,{field:'Title',min:3,max:150,required:true}),subject:security.str(b.subject,{field:'Subject',max:60}),grade:security.str(b.grade,{field:'Grade',max:20}),plan_date:/^\d{4}-\d{2}-\d{2}$/.test(String(b.plan_date||''))?b.plan_date:'',duration_min:security.int(b.duration_min,{field:'Duration',min:5,max:600,def:40}),objectives:security.str(b.objectives,{field:'Objectives',max:3000}),materials:security.str(b.materials,{field:'Materials',max:2000}),activities:security.str(b.activities,{field:'Activities',max:6000}),assessment:security.str(b.assessment,{field:'Assessment',max:3000}),reflection:security.str(b.reflection,{field:'Reflection',max:3000})};}
 route('GET','/api/plans/overview','user',ctx=>service.overview(ctx.user.id));
 route('GET','/api/plans','user',ctx=>{const q=security.str(ctx.query.get('q'),{field:'Search',max:100}).replace(/[%_]/g,'');const subject=security.str(ctx.query.get('subject'),{field:'Subject',max:60}).replace(/[%_]/g,'');const grade=security.str(ctx.query.get('grade'),{field:'Grade',max:20}).replace(/[%_]/g,'');const scope=security.oneOf(ctx.query.get('scope')||'all',['all','upcoming','past','undated'],'Plan filter');return service.list(ctx.user.id,{q,subject,grade,scope});});
 route('GET','/api/plans/:id','user',ctx=>service.detail(ctx.user.id,id(ctx.params.id)));
 route('POST','/api/plans','user',ctx=>service.create(ctx.user.id,fields(ctx.body)));
 route('PUT','/api/plans/:id','user',ctx=>service.update(ctx.user.id,id(ctx.params.id),fields(ctx.body)));
 route('DELETE','/api/plans/:id','user',ctx=>service.delete(ctx.user.id,id(ctx.params.id)));
 route('POST','/api/plans/:id/duplicate','user',ctx=>service.duplicate(ctx.user.id,id(ctx.params.id)));
}
module.exports={registerLessonPlanRoutes};
