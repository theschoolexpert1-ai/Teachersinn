'use strict';

function createLearningService({ repository, tx, notify, audit, nowIso, randomCertificate, verificationUrl, HttpError }) {
  return {
    listCourses: (userId) => repository.listCourses(userId),
    courseDetail(userId, courseId) {
      const course = repository.findAccessibleCourse(userId,courseId);
      if (!course) throw new HttpError(404, 'Course not found.');
      const enrollment = repository.findEnrollment(userId, courseId);
      const lessons = repository.listCourseLessons(userId, courseId)
        .map((lesson, index) => (enrollment || index === 0) ? lesson : { ...lesson, body: null, locked: true });
      return { course, enrollment: enrollment || null, lessons };
    },
    enroll(userId, courseId) {
      const course=repository.findAccessibleCourse(userId,courseId);
      if (!course||!course.published) throw new HttpError(404, 'Course not found.');
      repository.enroll(userId, courseId);
      return { ok: true };
    },
    completeLesson(ctx, lessonId) {
      return tx(() => {
        const lesson = repository.findLesson(lessonId);
        if (!lesson) throw new HttpError(404, 'Lesson not found.');
        const enrollment = repository.findEnrollment(ctx.user.id, lesson.course_id);
        if (!enrollment) throw new HttpError(403, 'Enroll in the course first.');
        repository.markLessonComplete(ctx.user.id, lessonId);
        const remaining = repository.countIncomplete(ctx.user.id, lesson.course_id);
        let certificate = null;
        if (remaining === 0 && !enrollment.completed_at) {
          certificate = randomCertificate();
          repository.completeEnrollment(nowIso(), certificate, ctx.user.id, lesson.course_id);
          const course = repository.courseTitle(lesson.course_id);
          notify(ctx.user.id, `Congratulations! You completed "${course.title}". Your certificate is ready.`, `#/certificate/${lesson.course_id}`);
          audit(ctx.user.id, 'course.complete', course.title, ctx.ip);
        }
        return { ok: true, courseComplete: remaining === 0, certificate };
      });
    },
    listCertificates: (userId) => repository.listCertificates(userId).map(c=>({...c,verification_url:verificationUrl(c.certificate_code)})),
    verifyCertificate(code) {
      const certificate = repository.verifyCertificate(code);
      if (!certificate) throw new HttpError(404, 'No certificate found with that code.');
      return { valid: true, status:'verified', issuer:'TeachersInn by SchoolExpert', verification_url:verificationUrl(certificate.certificate_code), ...certificate };
    },
  };
}

module.exports = { createLearningService };
