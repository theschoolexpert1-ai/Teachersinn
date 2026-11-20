'use strict';

const { defineRepositoryContract } = require('../../data/repository-contract');
const { DatabaseError } = require('../errors');

const learningContract = defineRepositoryContract('PostgreSQL learning', [
  'listCourses', 'courseDetail', 'enroll', 'completeLesson', 'listCertificates', 'cpdSummary', 'verifyCertificate',
]);

const ownId = (identity) => String(identity && identity.authUserId || '').trim();
const notFound = (message) => new DatabaseError(404, message, { code: 'NOT_FOUND' });

function createPostgresLearningRepository({ connection }) {
  if (!connection || typeof connection.withUserTransaction !== 'function' || typeof connection.withAnonymousTransaction !== 'function') {
    throw new TypeError('A PostgreSQL connection with user and anonymous transaction support is required.');
  }
  return learningContract.validate({
    async listCourses(identity) {
      return connection.withUserTransaction(identity, (db) => db.many(`select c.id,c.title,c.category,c.level,c.summary,c.instructor,c.cpd_hours,
        s.lessons::integer,s.minutes::integer,s.learners::integer,e.enrolled_at,e.completed_at,
        (select count(*)::integer from public.lesson_progress p join public.lessons l on l.id=p.lesson_id
          where l.course_id=c.id and p.user_id=$1) done
        from public.courses c cross join lateral public.course_learning_stats(c.id) s
        left join public.enrollments e on e.course_id=c.id and e.user_id=$1
        order by c.id`, [ownId(identity)]), { readOnly: true });
    },
    async courseDetail(identity, courseId) {
      return connection.withUserTransaction(identity, async (db) => {
        const course = await db.maybeOne('select * from public.courses where id=$1', [courseId]);
        if (!course) throw notFound('Course not found.');
        const enrollment = await db.maybeOne('select * from public.enrollments where user_id=$1 and course_id=$2', [ownId(identity), courseId]);
        const lessons = await db.many('select * from public.course_lesson_outline($1)', [courseId]);
        return { course, enrollment, lessons };
      }, { readOnly: true });
    },
    async enroll(identity, courseId) {
      return connection.withUserTransaction(identity, async (db) => {
        const course = await db.maybeOne("select id from public.courses where id=$1 and status='published'", [courseId]);
        if (!course) throw notFound('Course not found.');
        const id=ownId(identity);
        const inserted=await db.maybeOne(`insert into public.enrollments(user_id,course_id) values($1,$2)
          on conflict(user_id,course_id) do nothing
          returning user_id,course_id,enrolled_at,completed_at,certificate_code`, [id,courseId]);
        return inserted || db.one('select user_id,course_id,enrolled_at,completed_at,certificate_code from public.enrollments where user_id=$1 and course_id=$2',[id,courseId]);
      });
    },
    async completeLesson(identity, lessonId) {
      return connection.withUserTransaction(identity, async (db) => {
        const row = await db.maybeOne('select * from public.complete_course_lesson($1)', [lessonId]);
        if (!row) throw notFound('Lesson not found.');
        return row;
      });
    },
    async listCertificates(identity) {
      return connection.withUserTransaction(identity, (db) => db.many(`select c.id course_id,c.title,c.cpd_hours,c.instructor,
        e.completed_at,e.certificate_code from public.enrollments e join public.courses c on c.id=e.course_id
        where e.user_id=$1 and e.completed_at is not null order by e.completed_at desc`, [ownId(identity)]), { readOnly: true });
    },
    async cpdSummary(identity, year = new Date().getUTCFullYear()) {
      return connection.withUserTransaction(identity, async (db) => {
        const summary = await db.one(`select coalesce(sum(c.cpd_hours),0)::integer hours,count(*)::integer completions
          from public.enrollments e join public.courses c on c.id=e.course_id where e.user_id=$1
          and e.completed_at >= make_timestamptz($2,1,1,0,0,0,'UTC')
          and e.completed_at < make_timestamptz($2+1,1,1,0,0,0,'UTC')`, [ownId(identity), year]);
        const history = await db.many(`select c.id course_id,c.title,c.cpd_hours,e.completed_at,e.certificate_code
          from public.enrollments e join public.courses c on c.id=e.course_id
          where e.user_id=$1 and e.completed_at is not null order by e.completed_at desc`, [ownId(identity)]);
        return { year, ...summary, history };
      }, { readOnly: true });
    },
    async verifyCertificate(code) {
      const normalized = String(code || '').trim().toUpperCase();
      return connection.withAnonymousTransaction(async (db) => {
        const row = await db.maybeOne('select * from public.verify_certificate($1)', [normalized]);
        return row ? { ...row, certificate_code: normalized } : null;
      }, { readOnly: true });
    },
  });
}

module.exports = { learningContract, createPostgresLearningRepository };

