'use strict';

function createLearningRepository({ all, get, run }) {
  return {
    listCourses(userId) {
      return all(`SELECT c.id,c.title,c.category,c.level,c.summary,c.instructor,c.cpd_hours,
          (SELECT COUNT(*) FROM lessons l WHERE l.course_id=c.id) lessons,
          (SELECT COALESCE(SUM(minutes),0) FROM lessons l WHERE l.course_id=c.id) minutes,
          (SELECT COUNT(*) FROM enrollments e WHERE e.course_id=c.id) learners,
          e.enrolled_at, e.completed_at,
          (SELECT COUNT(*) FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id WHERE l.course_id=c.id AND p.user_id=?) done
        FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=?
        WHERE c.published=1 OR e.user_id IS NOT NULL ORDER BY c.id`, userId, userId);
    },
    findAccessibleCourse: (userId,courseId) => get(`SELECT c.* FROM courses c WHERE c.id=? AND
      (c.published=1 OR EXISTS(SELECT 1 FROM enrollments e WHERE e.course_id=c.id AND e.user_id=?))`,courseId,userId),
    findEnrollment: (userId, courseId) => get('SELECT * FROM enrollments WHERE user_id=? AND course_id=?', userId, courseId),
    listCourseLessons(userId, courseId) {
      return all(`SELECT l.id,l.position,l.title,l.minutes,l.body,
        EXISTS(SELECT 1 FROM lesson_progress p WHERE p.lesson_id=l.id AND p.user_id=?) done
        FROM lessons l WHERE l.course_id=? ORDER BY l.position`, userId, courseId);
    },
    enroll: (userId, courseId) => run('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?,?)', userId, courseId),
    findLesson: (lessonId) => get('SELECT * FROM lessons WHERE id=?', lessonId),
    markLessonComplete: (userId, lessonId) => run('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?,?)', userId, lessonId),
    countIncomplete(userId, courseId) {
      return get(`SELECT COUNT(*) n FROM lessons l WHERE l.course_id=? AND NOT EXISTS
        (SELECT 1 FROM lesson_progress p WHERE p.lesson_id=l.id AND p.user_id=?)`, courseId, userId).n;
    },
    completeEnrollment: (completedAt, certificate, userId, courseId) => run('UPDATE enrollments SET completed_at=?, certificate_code=? WHERE user_id=? AND course_id=? AND completed_at IS NULL', completedAt, certificate, userId, courseId),
    courseTitle: (courseId) => get('SELECT title FROM courses WHERE id=?', courseId),
    listCertificates(userId) {
      return all(`SELECT c.id course_id,c.title,c.cpd_hours,c.instructor,e.completed_at,e.certificate_code
        FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=? AND e.completed_at IS NOT NULL ORDER BY e.completed_at DESC`, userId);
    },
    verifyCertificate(code) {
      return get(`SELECT u.name,c.title,c.cpd_hours,e.completed_at,e.certificate_code FROM enrollments e
        JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id WHERE e.certificate_code=?`, code);
    },
  };
}

module.exports = { createLearningRepository };
