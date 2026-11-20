'use strict';

function createAdminRepository({ all, get, run }) {
  return {
    scalar: (sql, ...params) => get(sql, ...params).n,
    rows: (sql, ...params) => all(sql, ...params),
    findUser: (userId) => get('SELECT * FROM users WHERE id=?', userId),
    updateUser(userId, role, status, unlock) {
      return run(`UPDATE users SET role=?, status=?, open_to_mentor=CASE WHEN ?='mentor' THEN 1 ELSE open_to_mentor END,
        locked_until=CASE WHEN ? THEN 0 ELSE locked_until END, failed_logins=CASE WHEN ? THEN 0 ELSE failed_logins END WHERE id=?`,
      role, status, role, unlock ? 1 : 0, unlock ? 1 : 0, userId);
    },
    deleteUserSessions: (userId) => run('DELETE FROM sessions WHERE user_id=?', userId),
    createJob: (values) => run('INSERT INTO jobs (title,school,city,job_type,subject,description,apply_email,posted_by) VALUES (?,?,?,?,?,?,?,?)',...values),
    findJob: (id) => get('SELECT * FROM jobs WHERE id=?',id),
    closeJob: (id) => run("UPDATE jobs SET status='closed' WHERE id=?",id),
    createCourse: (course) => run(`INSERT INTO courses
      (title,category,level,summary,instructor,cpd_hours,published,description,thumbnail,objectives,prerequisites,estimated_minutes,status,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`, course.title,course.category,course.level,course.summary,course.instructor,
      course.cpd_hours,course.status==='published'?1:0,course.description,course.thumbnail,course.objectives,course.prerequisites,
      course.estimated_minutes,course.status),
    createLesson: (courseId,position,lesson) => run('INSERT INTO lessons (course_id,position,title,body,minutes) VALUES (?,?,?,?,?)',courseId,position,lesson.title,lesson.body,lesson.minutes),
    courses: () => all(`SELECT c.id,c.title,c.category,c.level,c.instructor,c.cpd_hours,c.published,c.status,c.created_at,c.updated_at,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) lessons,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) enrollments,
      (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id AND e.certificate_code IS NOT NULL) certificates
      FROM courses c ORDER BY c.id DESC`),
    course: (courseId) => get('SELECT * FROM courses WHERE id=?',courseId),
    courseLessons: (courseId) => all('SELECT id,position,title,body,minutes FROM lessons WHERE course_id=? ORDER BY position',courseId),
    courseHistory: (courseId) => get(`SELECT COUNT(*) enrollments,
      SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) completions,
      SUM(CASE WHEN certificate_code IS NOT NULL THEN 1 ELSE 0 END) certificates
      FROM enrollments WHERE course_id=?`,courseId),
    lessonProgressCount: (courseId) => get('SELECT COUNT(*) n FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=?',courseId).n,
    updateCourse(courseId,course) { return run(`UPDATE courses SET title=?,category=?,level=?,summary=?,instructor=?,cpd_hours=?,
      description=?,thumbnail=?,objectives=?,prerequisites=?,estimated_minutes=?,updated_at=datetime('now') WHERE id=?`,
    course.title,course.category,course.level,course.summary,course.instructor,course.cpd_hours,course.description,course.thumbnail,
    course.objectives,course.prerequisites,course.estimated_minutes,courseId); },
    updateCourseStatus: (courseId,status) => run('UPDATE courses SET status=?,published=?,updated_at=datetime(\'now\') WHERE id=?',status,status==='published'?1:0,courseId),
    updateLesson: (lesson) => run('UPDATE lessons SET position=?,title=?,body=?,minutes=? WHERE id=? AND course_id=?',lesson.position,lesson.title,lesson.body,lesson.minutes,lesson.id,lesson.courseId),
    deleteCourseLessons: (courseId) => run('DELETE FROM lessons WHERE course_id=?',courseId),
    jobs: () => all(`SELECT j.id,j.title,j.school,j.city,j.job_type,j.subject,j.status,j.created_at,COUNT(a.id) applications FROM jobs j LEFT JOIN job_applications a ON a.job_id=j.id GROUP BY j.id ORDER BY j.id DESC`),
    discussions: () => all(`SELECT p.id,p.title,p.created_at,u.name author,c.name category,COUNT(r.id) replies FROM posts p JOIN users u ON u.id=p.user_id JOIN communities c ON c.id=p.community_id LEFT JOIN replies r ON r.post_id=p.id GROUP BY p.id ORDER BY p.id DESC LIMIT 200`),
    mentorships: () => all(`SELECT m.id,m.topic,m.status,m.created_at,mentee.name mentee,mentor.name mentor FROM mentorships m JOIN users mentee ON mentee.id=m.mentee_id JOIN users mentor ON mentor.id=m.mentor_id ORDER BY m.id DESC LIMIT 200`),
    userDetail:(id)=>get(`SELECT id,name,email,role,status,designation,school,subjects,grades,board,city,state,bio,experience_years,directory_visible,open_to_mentor,created_at,last_login_at FROM users WHERE id=?`,id),
    userMetric:(sql,id,...rest)=>get(sql,id,...rest).n,
    auditLog(q,page){const like=`%${q}%`,limit=50;const total=get(`SELECT COUNT(*) n FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE (?='' OR a.action LIKE ? OR a.detail LIKE ? OR u.name LIKE ? OR u.email LIKE ?)`,q,like,like,like,like).n;return{items:all(`SELECT a.*,u.name,u.email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE (?='' OR a.action LIKE ? OR a.detail LIKE ? OR u.name LIKE ? OR u.email LIKE ?) ORDER BY a.id DESC LIMIT ? OFFSET ?`,q,like,like,like,like,limit,(page-1)*limit),total,page,pages:Math.max(1,Math.ceil(total/limit))};},
    users({q,role,status,recent,now}){return all(`SELECT id,name,email,role,status,designation,school,city,created_at,last_login_at,locked_until>? AS locked,(CASE WHEN designation<>'' THEN 1 ELSE 0 END+CASE WHEN school<>'' THEN 1 ELSE 0 END+CASE WHEN subjects<>'' THEN 1 ELSE 0 END+CASE WHEN grades<>'' THEN 1 ELSE 0 END+CASE WHEN city<>'' THEN 1 ELSE 0 END+CASE WHEN bio<>'' THEN 1 ELSE 0 END)*100/6 profile_completion FROM users WHERE (name LIKE ? OR email LIKE ? OR school LIKE ?) AND (?='' OR role=?) AND (?='' OR status=?) AND (?=0 OR created_at>=datetime('now','-30 days')) ORDER BY id DESC LIMIT 200`,now,q,q,q,role,role,status,status,recent);},
    tickets(status,q){const like=`%${q}%`;return all(`SELECT t.*,u.name requester,u.email FROM tickets t JOIN users u ON u.id=t.user_id WHERE (?='' OR t.status=?) AND (?='' OR t.subject LIKE ? OR u.name LIKE ? OR u.email LIKE ?) ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,CASE t.priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END,t.updated_at DESC LIMIT 200`,status,status,q,like,like,like);},
    recentAudit:()=>all(`SELECT a.*,u.name,u.email FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 300`),
  };
}

module.exports = { createAdminRepository };
