'use strict';

function createAdminService({ repository, tx, audit, HttpError }) {
  return {
    overview() {
      const n = repository.scalar;
      return {
        users: n('SELECT COUNT(*) n FROM users'), teachers: n("SELECT COUNT(*) n FROM users WHERE role IN ('educator','mentor')"),
        courses: n('SELECT COUNT(*) n FROM courses'), newUsers30: n("SELECT COUNT(*) n FROM users WHERE created_at >= datetime('now','-30 days')"),
        activeSessions: n('SELECT COUNT(*) n FROM sessions WHERE expires_at>?', Date.now()), enrollments: n('SELECT COUNT(*) n FROM enrollments'),
        completions: n('SELECT COUNT(*) n FROM enrollments WHERE completed_at IS NOT NULL'), workshopRegs: n('SELECT COUNT(*) n FROM workshop_regs'),
        workshops: n('SELECT COUNT(*) n FROM workshops'), jobs: n('SELECT COUNT(*) n FROM jobs'), applications: n('SELECT COUNT(*) n FROM job_applications'),
        replies: n('SELECT COUNT(*) n FROM replies'), tickets: n('SELECT COUNT(*) n FROM tickets'),
        openTickets: n("SELECT COUNT(*) n FROM tickets WHERE status IN ('open','in_progress')"), posts: n('SELECT COUNT(*) n FROM posts'),
        failedLogins24h: n("SELECT COUNT(*) n FROM audit_log WHERE action IN ('auth.login_fail','auth.locked') AND created_at >= datetime('now','-1 day')"),
        signups: repository.rows("SELECT date(created_at) d, COUNT(*) n FROM users WHERE created_at >= date('now','-29 days') GROUP BY d ORDER BY d"),
        popularCourses: repository.rows('SELECT c.title, COUNT(e.user_id) n FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id GROUP BY c.id ORDER BY n DESC LIMIT 5'),
      };
    },
    analytics(period) {
      const n = repository.scalar;
      const filter = period === 'all' ? '' : ` WHERE created_at>=datetime('now','-${period} days')`;
      const registrations = period === 'all' ? '' : ` WHERE registered_at>=datetime('now','-${period} days')`;
      const applications = period === 'all' ? '' : ` WHERE applied_at>=datetime('now','-${period} days')`;
      return { period,
        enrollments: n(`SELECT COUNT(*) n FROM enrollments${period === 'all' ? '' : ` WHERE enrolled_at>=datetime('now','-${period} days')`}`),
        completions: n(`SELECT COUNT(*) n FROM enrollments${period === 'all' ? ' WHERE completed_at IS NOT NULL' : ` WHERE completed_at>=datetime('now','-${period} days')`}`),
        certificates: n(`SELECT COUNT(*) n FROM enrollments${period === 'all' ? ' WHERE certificate_code IS NOT NULL' : ` WHERE certificate_code IS NOT NULL AND completed_at>=datetime('now','-${period} days')`}`),
        workshopRegistrations: n(`SELECT COUNT(*) n FROM workshop_regs${registrations}`),
        attended: n(`SELECT COUNT(*) n FROM workshop_regs${period === 'all' ? " WHERE attendance_status='attended'" : ` WHERE attendance_status='attended' AND attendance_verified_at>=datetime('now','-${period} days')`}`),
        discussions: n(`SELECT COUNT(*) n FROM posts${filter}`), replies: n(`SELECT COUNT(*) n FROM replies${filter}`), jobs: n(`SELECT COUNT(*) n FROM jobs${filter}`),
        applications: n(`SELECT COUNT(*) n FROM job_applications${applications}`), connections: n(`SELECT COUNT(*) n FROM connections${filter}`),
        acceptedConnections: n(`SELECT COUNT(*) n FROM connections${period === 'all' ? " WHERE status='accepted'" : ` WHERE status='accepted' AND created_at>=datetime('now','-${period} days')`}`),
      };
    },
    updateUser(ctx, userId, role, status, unlock) {
      const target = repository.findUser(userId);
      if (!target) throw new HttpError(404, 'User not found.');
      if (userId === ctx.user.id) throw new HttpError(400, 'You cannot change your own role or status.');
      tx(() => {
        repository.updateUser(userId, role || target.role, status || target.status, unlock);
        if ((status || target.status) === 'suspended') repository.deleteUserSessions(userId);
        audit(ctx.user.id, 'admin.user_update', `#${userId} role=${role || target.role} status=${status || target.status}${unlock ? ' unlocked' : ''}`, ctx.ip);
      });
      return { ok: true };
    },
    createJob(ctx,fields){return tx(()=>{const result=repository.createJob([...Object.values(fields),ctx.user.id]);audit(ctx.user.id,'admin.job_create',`#${result.lastInsertRowid}`,ctx.ip);return{ok:true};});},
    closeJob(ctx,jobId){if(!repository.findJob(jobId))throw new HttpError(404,'Job not found.');return tx(()=>{repository.closeJob(jobId);audit(ctx.user.id,'admin.job_close',`#${jobId}`,ctx.ip);return{ok:true};});},
    createCourse(ctx,fields,lessons){return tx(()=>{const result=repository.createCourse(fields);const courseId=Number(result.lastInsertRowid);lessons.forEach((lesson,index)=>repository.createLesson(courseId,index+1,lesson));audit(ctx.user.id,'admin.course_create',`#${courseId} status=${fields.status}`,ctx.ip);return{ok:true,id:courseId,status:fields.status};});},
    course(courseId){const course=repository.course(courseId);if(!course)throw new HttpError(404,'Course not found.');return{course,lessons:repository.courseLessons(courseId),history:repository.courseHistory(courseId)};},
    updateCourse(ctx,courseId,fields){if(!repository.course(courseId))throw new HttpError(404,'Course not found.');return tx(()=>{repository.updateCourse(courseId,fields);audit(ctx.user.id,'admin.course_update',`#${courseId}`,ctx.ip);return{ok:true};});},
    replaceCurriculum(ctx,courseId,lessons){
      const course=repository.course(courseId);if(!course)throw new HttpError(404,'Course not found.');
      const history=repository.courseHistory(courseId);const progress=repository.lessonProgressCount(courseId);
      if(Number(history.enrollments)>0||progress>0)throw new HttpError(409,'Curriculum cannot be replaced after enrollment. Edit course details or archive the course instead.');
      return tx(()=>{repository.deleteCourseLessons(courseId);lessons.forEach((lesson,index)=>repository.createLesson(courseId,index+1,lesson));audit(ctx.user.id,'admin.course_curriculum',`#${courseId} lessons=${lessons.length}`,ctx.ip);return{ok:true};});
    },
    setCourseStatus(ctx,courseId,status){
      const course=repository.course(courseId);if(!course)throw new HttpError(404,'Course not found.');
      const lessons=repository.courseLessons(courseId);
      if(status==='published'&&lessons.length<1)throw new HttpError(409,'Add at least one lesson before publishing.');
      return tx(()=>{repository.updateCourseStatus(courseId,status);audit(ctx.user.id,'admin.course_status',`#${courseId} ${course.status}->${status}`,ctx.ip);return{ok:true,status};});
    },
    courses:()=>repository.courses(),jobs:()=>repository.jobs(),discussions:()=>repository.discussions(),mentorships:()=>repository.mentorships(),
    userDetail(id){const user=repository.userDetail(id);if(!user)throw new HttpError(404,'Teacher not found.');const n=repository.userMetric;return{...user,enrollments:n('SELECT COUNT(*) n FROM enrollments WHERE user_id=?',id),completions:n('SELECT COUNT(*) n FROM enrollments WHERE user_id=? AND completed_at IS NOT NULL',id),workshops:n('SELECT COUNT(*) n FROM workshop_regs WHERE user_id=?',id),connections:n("SELECT COUNT(*) n FROM connections WHERE status='accepted' AND (requester_id=? OR addressee_id=?)",id,id)};},
    auditLog:(q,page)=>repository.auditLog(q,page),users:(filters)=>repository.users({...filters,now:Date.now()}),tickets:(status,q)=>repository.tickets(status,q),recentAudit:()=>repository.recentAudit(),
  };
}

module.exports = { createAdminService };
