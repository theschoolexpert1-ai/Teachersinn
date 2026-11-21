'use strict';

const { defineRepositoryContract } = require('../../data/repository-contract');
const { DatabaseError } = require('../errors');

const FIELDS = Object.freeze(['title','category','level','summary','instructor','cpd_hours','description','thumbnail','objectives','prerequisites','estimated_minutes']);
const adminLearningContract = defineRepositoryContract('PostgreSQL administrator learning', [
  'listCourses', 'courseDetail', 'createCourse', 'updateCourse', 'replaceCurriculum', 'setCourseStatus',
]);
const forbidden = () => new DatabaseError(403, 'Administrator access is required.', { code: 'FORBIDDEN' });
const missing = () => new DatabaseError(404, 'Course not found.', { code: 'NOT_FOUND' });
async function requireAdmin(db) { if (!(await db.one('select public.is_admin() authorized', [])).authorized) throw forbidden(); }

function createPostgresAdminLearningRepository({ connection }) {
  if (!connection || typeof connection.withUserTransaction !== 'function') throw new TypeError('A PostgreSQL connection is required.');
  return adminLearningContract.validate({
    async listCourses(identity) {
      return connection.withUserTransaction(identity, async (db) => { await requireAdmin(db); return db.many(`select c.id,c.title,c.category,c.level,c.instructor,c.cpd_hours,c.published,c.status,c.created_at,c.updated_at,
        count(distinct l.id)::integer lessons,count(distinct e.user_id)::integer enrollments,
        count(distinct e.user_id) filter(where e.certificate_code is not null)::integer certificates
        from public.courses c left join public.lessons l on l.course_id=c.id left join public.enrollments e on e.course_id=c.id
        group by c.id order by c.id desc`, []); }, { readOnly: true });
    },
    async courseDetail(identity, courseId) {
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db);
        const course = await db.maybeOne('select * from public.courses where id=$1', [courseId]); if (!course) throw missing();
        const lessons = await db.many('select id,position,title,body,minutes from public.lessons where course_id=$1 order by position', [courseId]);
        const history = await db.one(`select count(*)::integer enrollments,count(*) filter(where completed_at is not null)::integer completions,
          count(*) filter(where certificate_code is not null)::integer certificates from public.enrollments where course_id=$1`, [courseId]);
        return { course, lessons, history };
      }, { readOnly: true });
    },
    async createCourse(identity, fields, lessons = []) {
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db);
        const status = fields.status === 'published' ? 'published' : 'draft';
        if (status === 'published' && !lessons.length) throw new DatabaseError(409, 'Add at least one lesson before publishing.', { code: 'COURSE_EMPTY' });
        const names = FIELDS.filter((name) => Object.hasOwn(fields, name));
        const course = await db.one(`insert into public.courses(${names.join(',')},status) values(${names.map((_,i)=>`$${i+1}`).join(',')},$${names.length+1}) returning *`,
          [...names.map((name)=>fields[name]), status]);
        for (let index=0; index<lessons.length; index++) await db.one(
          'insert into public.lessons(course_id,position,title,body,minutes) values($1,$2,$3,$4,$5) returning id',
          [course.id,index+1,lessons[index].title,lessons[index].body,lessons[index].minutes],
        );
        return { ...course, lessons: lessons.length };
      });
    },
    async updateCourse(identity, courseId, fields) {
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db); const names=FIELDS.filter((name)=>Object.hasOwn(fields,name));
        if (!names.length) throw new DatabaseError(400, 'No supported course fields were provided.', { code: 'INVALID_INPUT' });
        const row=await db.maybeOne(`update public.courses set ${names.map((name,i)=>`${name}=$${i+1}`).join(',')} where id=$${names.length+1} returning *`, [...names.map((name)=>fields[name]),courseId]);
        if(!row)throw missing(); return row;
      });
    },
    async replaceCurriculum(identity, courseId, lessons) {
      return connection.withUserTransaction(identity, async (db) => {
        await requireAdmin(db); if(!await db.maybeOne('select id from public.courses where id=$1',[courseId]))throw missing();
        await db.execute('delete from public.lessons where course_id=$1',[courseId]);
        for(let index=0;index<lessons.length;index++)await db.one('insert into public.lessons(course_id,position,title,body,minutes) values($1,$2,$3,$4,$5) returning id',[courseId,index+1,lessons[index].title,lessons[index].body,lessons[index].minutes]);
        return { ok:true,lessons:lessons.length };
      });
    },
    async setCourseStatus(identity, courseId, status) {
      if(!['draft','published','archived'].includes(status))throw new DatabaseError(400,'Invalid course status.',{code:'INVALID_INPUT'});
      return connection.withUserTransaction(identity, async(db)=>{await requireAdmin(db);
        if(!await db.maybeOne('select id from public.courses where id=$1',[courseId]))throw missing();
        if(status==='published'&&!(await db.one('select count(*)::integer n from public.lessons where course_id=$1',[courseId])).n)throw new DatabaseError(409,'Add at least one lesson before publishing.',{code:'COURSE_EMPTY'});
        const row=await db.maybeOne('update public.courses set status=$1 where id=$2 returning id,status,published,updated_at',[status,courseId]);if(!row)throw missing();return row;
      });
    },
  });
}
module.exports={ FIELDS,adminLearningContract,createPostgresAdminLearningRepository };
