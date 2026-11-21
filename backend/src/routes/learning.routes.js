'use strict';
function registerLearningRoutes({route,service,security,id}){
 route('GET','/api/courses','user',ctx=>service.listCourses(ctx.user.id));
 route('GET','/api/courses/:id','user',ctx=>service.courseDetail(ctx.user.id,id(ctx.params.id)));
 route('POST','/api/courses/:id/enroll','user',ctx=>service.enroll(ctx.user.id,id(ctx.params.id)));
 route('POST','/api/lessons/:id/complete','user',ctx=>service.completeLesson(ctx,id(ctx.params.id)));
 route('GET','/api/certificates','user',ctx=>service.listCertificates(ctx.user.id));
 route('GET','/api/certificates/verify/:code','public',ctx=>service.verifyCertificate(security.str(ctx.params.code,{field:'Code',max:20})));
}
module.exports={registerLearningRoutes};
