'use strict';

function lessonInput(security, value, index) {
  return { title:security.str(value&&value.title,{field:`Lesson ${index+1} title`,min:3,max:150,required:true}),
    body:security.str(value&&value.body,{field:`Lesson ${index+1} content`,min:10,max:8000,required:true}),
    minutes:security.int(value&&value.minutes,{field:`Lesson ${index+1} minutes`,min:1,max:300,def:10}) };
}

function courseInput(security, body) {
  const b=body||{};
  return {title:security.str(b.title,{field:'Title',min:5,max:150,required:true}),category:security.str(b.category,{field:'Category',max:60,required:true}),
    level:security.oneOf(b.level,['Beginner','Intermediate','Advanced'],'Level'),summary:security.str(b.summary,{field:'Summary',min:20,max:600,required:true}),
    instructor:security.str(b.instructor,{field:'Instructor',min:2,max:80,required:true}),cpd_hours:security.int(b.cpd_hours,{field:'CPD hours',min:0,max:100}),
    description:security.str(b.description||b.summary,{field:'Detailed description',min:20,max:8000,required:true}),
    thumbnail:security.str(b.thumbnail,{field:'Thumbnail URL',max:500}),objectives:security.str(b.objectives,{field:'Learning objectives',max:3000}),
    prerequisites:security.str(b.prerequisites,{field:'Prerequisites',max:2000}),estimated_minutes:security.int(b.estimated_minutes,{field:'Estimated duration',min:0,max:100000,def:0})};
}

function registerAdminRoutes({route,admin,support,security,id,userId=id}){
 route('GET','/api/admin/overview','admin',()=>admin.overview());route('GET','/api/admin/analytics','admin',ctx=>admin.analytics(security.oneOf(ctx.query.get('period')||'30',['7','30','all'],'Analytics period')));route('GET','/api/admin/users/:id','admin',ctx=>admin.userDetail(userId(ctx.params.id)));route('GET','/api/admin/courses','admin',()=>admin.courses());route('GET','/api/admin/courses/:id','admin',ctx=>admin.course(id(ctx.params.id)));route('GET','/api/admin/jobs','admin',()=>admin.jobs());route('GET','/api/admin/discussions','admin',()=>admin.discussions());route('GET','/api/admin/mentorships','admin',()=>admin.mentorships());
 route('GET','/api/admin/audit-log','admin',ctx=>admin.auditLog(security.str(ctx.query.get('q'),{field:'Search',max:80}).replace(/[%_]/g,''),security.int(ctx.query.get('page'),{field:'Page',min:1,max:100000,def:1})));
 route('GET','/api/admin/users','admin',ctx=>admin.users({q:`%${security.str(ctx.query.get('q'),{field:'Search',max:60}).replace(/[%_]/g,'')}%`,role:ctx.query.get('role')?security.oneOf(ctx.query.get('role'),['educator','mentor','admin'],'Role'):'',status:ctx.query.get('status')?security.oneOf(ctx.query.get('status'),['active','suspended'],'Status'):'',recent:ctx.query.get('recent')==='1'?1:0}));
 route('POST','/api/admin/users/:id','admin',ctx=>admin.updateUser(ctx,userId(ctx.params.id),ctx.body.role?security.oneOf(ctx.body.role,['educator','mentor','admin'],'Role'):null,ctx.body.status?security.oneOf(ctx.body.status,['active','suspended'],'Status'):null,!!ctx.body.unlock));
 route('GET','/api/admin/tickets','admin',ctx=>admin.tickets(ctx.query.get('status')?security.oneOf(ctx.query.get('status'),['open','in_progress','resolved','closed'],'Status'):'',security.str(ctx.query.get('q'),{field:'Search',max:80}).replace(/[%_]/g,'')));
 route('POST','/api/admin/tickets/:id','admin',ctx=>support.adminUpdate(ctx,id(ctx.params.id),ctx.body.status?security.oneOf(ctx.body.status,['open','in_progress','resolved','closed'],'Status'):null,ctx.body.priority?security.oneOf(ctx.body.priority,['low','normal','high'],'Priority'):null));
 route('POST','/api/admin/courses','admin',ctx=>{const b=ctx.body;const status=b.status?security.oneOf(b.status,['draft','published'],'Course status'):'draft';if(!Array.isArray(b.lessons)||b.lessons.length>40)throw new security.ValidationError('Add no more than 40 lessons.');if(status==='published'&&b.lessons.length<1)throw new security.ValidationError('Add at least one lesson before publishing.');return admin.createCourse(ctx,{...courseInput(security,b),status},b.lessons.map((l,i)=>lessonInput(security,l,i)));});
 route('PUT','/api/admin/courses/:id','admin',ctx=>admin.updateCourse(ctx,id(ctx.params.id),courseInput(security,ctx.body)));
 route('PUT','/api/admin/courses/:id/lessons','admin',ctx=>{const lessons=ctx.body.lessons;if(!Array.isArray(lessons)||lessons.length>40)throw new security.ValidationError('Add no more than 40 lessons.');return admin.replaceCurriculum(ctx,id(ctx.params.id),lessons.map((l,i)=>lessonInput(security,l,i)));});
 route('POST','/api/admin/courses/:id/status','admin',ctx=>admin.setCourseStatus(ctx,id(ctx.params.id),security.oneOf(ctx.body.status,['draft','published','archived'],'Course status')));
 route('GET','/api/admin/audit','admin',()=>admin.recentAudit());
}
module.exports={registerAdminRoutes};
