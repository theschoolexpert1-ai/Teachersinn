'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const url = String(process.env.SUPABASE_TEST_URL || '').trim();
const publishableKey = String(process.env.SUPABASE_TEST_PUBLISHABLE_KEY || '').trim();
const secretKey = String(process.env.SUPABASE_TEST_SECRET_KEY || '').trim();
const projectRef = String(process.env.SUPABASE_TEST_PROJECT_REF || '').trim();
const targetEnvironment = String(process.env.SUPABASE_TEST_ENVIRONMENT || '').trim().toLowerCase();
const runEnabled = process.env.RUN_SUPABASE_INTEGRATION === '1';

function requireEnvironment() {
  assert.equal(runEnabled, true, 'Set RUN_SUPABASE_INTEGRATION=1 to run against an isolated Supabase project.');
  assert.ok(url && publishableKey && secretKey, 'SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY, and SUPABASE_TEST_SECRET_KEY are required.');
  const host = new URL(url).hostname;
  const local = host === '127.0.0.1' || host === 'localhost';
  if (!local) {
    assert.equal(process.env.SUPABASE_TEST_ALLOW_REMOTE, '1', 'Remote tests require SUPABASE_TEST_ALLOW_REMOTE=1.');
    assert.equal(targetEnvironment, 'development', 'Remote tests require SUPABASE_TEST_ENVIRONMENT=development.');
    assert.match(projectRef, /^[a-z0-9]{20}$/, 'SUPABASE_TEST_PROJECT_REF must be the 20-character development project reference.');
    assert.equal(host, `${projectRef}.supabase.co`, 'SUPABASE_TEST_URL must match SUPABASE_TEST_PROJECT_REF.');
  }
}

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const random = crypto.randomBytes(8).toString('hex');
const prefix = `stage-a1-${random}`;
const password = `Valid-${random}-Password-2026`;

async function signIn(email) {
  const client = createClient(url, publishableKey, options);
  const { error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  return client;
}

async function expectNoRows(query, label) {
  const { data, error } = await query;
  assert.ifError(error);
  assert.deepEqual(data, [], label);
}

test('Supabase migrations, RLS and Storage enforce TeachersInn isolation', async (t) => {
  requireEnvironment();
  const service = createClient(url, secretKey, options);
  const anon = createClient(url, publishableKey, options);
  const users = [];
  const objects = [];
  const created = {};

  try {
    for (const role of ['teacher-one', 'teacher-two', 'teacher-three', 'administrator']) {
      const email = `${prefix}-${role}@example.invalid`;
      const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: role } });
      assert.ifError(error);
      users.push(data.user);
    }
    const [oneUser, twoUser, threeUser, adminUser] = users;
    const { error: roleError } = await service.from('account_settings').update({ role: 'admin' }).eq('id', adminUser.id);
    assert.ifError(roleError);
    const [one, two, three, administrator] = await Promise.all(users.map((user) => signIn(user.email)));

    await t.test('anonymous, profile and account permissions', async () => {
      const anonymousProfiles = await anon.from('profiles').select('id').limit(1);
      assert.ok(anonymousProfiles.error, 'anonymous table reads must be denied');

      const own = await one.from('profiles').update({ city: 'Validation City' }).eq('id', oneUser.id).select('id,city');
      assert.ifError(own.error);
      assert.equal(own.data[0].city, 'Validation City');
      await expectNoRows(one.from('profiles').update({ city: 'Forbidden City' }).eq('id', twoUser.id).select('id'), 'cross-profile update must affect no rows');

      const legacy = await one.from('profiles').update({ legacy_id: 999999 }).eq('id', oneUser.id);
      assert.ok(legacy.error, 'legacy identity columns must not be writable');
      await expectNoRows(one.from('account_settings').update({ role: 'admin' }).eq('id', oneUser.id).select('id'), 'teacher must not self-promote');

      const settings = await service.from('account_settings').select('role').eq('id', oneUser.id).single();
      assert.ifError(settings.error);
      assert.equal(settings.data.role, 'educator');
      const adminMap = await administrator.from('legacy_user_map').select('legacy_user_id').limit(1);
      assert.ifError(adminMap.error);
      const teacherMap = await one.from('legacy_user_map').select('legacy_user_id').limit(1);
      assert.deepEqual(teacherMap.data, []);
    });

    await t.test('course ownership and certificate verification', async () => {
      const course = await service.from('courses').insert({ title: `${prefix} course`, category: 'Validation', summary: 'Isolated integration course.', instructor: 'Integration Test', cpd_hours: 2 }).select('id').single();
      assert.ifError(course.error); created.course = course.data.id;
      const lesson = await service.from('lessons').insert({ course_id: created.course, position: 1, title: 'Validation lesson', body: 'Integration content', minutes: 5 }).select('id').single();
      assert.ifError(lesson.error); created.lesson = lesson.data.id;

      const enrollment = await one.from('enrollments').insert({ user_id: oneUser.id, course_id: created.course });
      assert.ifError(enrollment.error);
      const foreignEnrollment = await one.from('enrollments').insert({ user_id: twoUser.id, course_id: created.course });
      assert.ok(foreignEnrollment.error);
      const progress = await one.from('lesson_progress').insert({ user_id: oneUser.id, lesson_id: created.lesson });
      assert.ifError(progress.error);
      const foreignProgress = await one.from('lesson_progress').insert({ user_id: twoUser.id, lesson_id: created.lesson });
      assert.ok(foreignProgress.error);

      const code = `VALID-${random.toUpperCase()}`;
      const completed = await service.from('enrollments').update({ completed_at: new Date().toISOString(), certificate_code: code }).match({ user_id: oneUser.id, course_id: created.course });
      assert.ifError(completed.error);
      const verified = await anon.rpc('verify_certificate', { verification_code: code });
      assert.ifError(verified.error);
      assert.equal(verified.data.length, 1);
      assert.deepEqual(Object.keys(verified.data[0]).sort(), ['completed_at','cpd_hours','name','title']);

      const teacherPublish = await two.from('courses').update({ status: 'draft' }).eq('id', created.course).select('id');
      assert.ifError(teacherPublish.error); assert.deepEqual(teacherPublish.data, [], 'teachers cannot change course lifecycle');
      const archived = await administrator.from('courses').update({ status: 'archived' }).eq('id', created.course).select('id,status,published');
      assert.ifError(archived.error); assert.equal(archived.data[0].status, 'archived'); assert.equal(archived.data[0].published, false);
      const enrolledRead = await one.from('courses').select('id').eq('id', created.course);
      assert.ifError(enrolledRead.error); assert.equal(enrolledRead.data.length, 1, 'enrolled teacher retains archived course access');
      await expectNoRows(two.from('courses').select('id').eq('id', created.course), 'unrelated teacher cannot view archived course');
      const curriculumChange = await administrator.from('lessons').insert({ course_id: created.course, position: 2, title: 'Forbidden change', body: 'Enrollment protects this curriculum.', minutes: 5 });
      assert.ok(curriculumChange.error, 'curriculum must be immutable after enrollment');
    });

    await t.test('career, applications and notification preferences remain owner-scoped', async () => {
      const career = await one.from('career_profiles').insert({ user_id: oneUser.id, professional_summary: 'Private career summary' }).select('user_id').single();
      assert.ifError(career.error);
      await expectNoRows(two.from('career_profiles').select('user_id').eq('user_id', oneUser.id), 'career profile must remain private');
      await expectNoRows(two.from('career_profiles').update({ professional_summary: 'Forbidden' }).eq('user_id', oneUser.id).select('user_id'), 'career profile cross-update');

      const preferences = await one.from('notification_preferences').insert({ user_id: oneUser.id, messages: false }).select('user_id,messages').single();
      assert.ifError(preferences.error); assert.equal(preferences.data.messages, false);
      await expectNoRows(two.from('notification_preferences').select('user_id').eq('user_id', oneUser.id), 'preferences must remain private');
      await expectNoRows(two.from('notification_preferences').update({ messages: true }).eq('user_id', oneUser.id).select('user_id'), 'preference cross-update');

      const job = await service.from('jobs').insert({ title: `${prefix} job`, school: 'Validation School', city: 'Validation City', description: 'Disposable private application test.', apply_email: 'jobs@example.invalid' }).select('id').single();
      assert.ifError(job.error); created.job = job.data.id;
      const application = await one.from('job_applications').insert({ user_id: oneUser.id, job_id: created.job }).select('id').single();
      assert.ifError(application.error); created.application = application.data.id;
      await expectNoRows(two.from('job_applications').select('id').eq('id', created.application), 'job application must remain private');
      const impersonation = await two.from('job_applications').insert({ user_id: oneUser.id, job_id: created.job });
      assert.ok(impersonation.error);
      const adminRead = await administrator.from('job_applications').select('id').eq('id', created.application);
      assert.ifError(adminRead.error); assert.equal(adminRead.data.length, 1);
    });

    await t.test('connections, messages and private records are isolated', async () => {
      const connection = await one.from('connections').insert({ requester_id: oneUser.id, addressee_id: twoUser.id }).select('id').single();
      assert.ifError(connection.error); created.connection = connection.data.id;
      const accepted = await two.from('connections').update({ status: 'accepted' }).eq('id', created.connection).select('id');
      assert.ifError(accepted.error); assert.equal(accepted.data.length, 1);
      await expectNoRows(three.from('connections').update({ status: 'declined' }).eq('id', created.connection).select('id'), 'unrelated connection update');

      const message = await one.from('messages').insert({ sender_id: oneUser.id, recipient_id: twoUser.id, body: 'private validation message' }).select('id').single();
      assert.ifError(message.error); created.message = message.data.id;
      await expectNoRows(three.from('messages').select('id').eq('id', created.message), 'unrelated messages must be invisible');
      const impersonation = await one.from('messages').insert({ sender_id: twoUser.id, recipient_id: oneUser.id, body: 'impersonation' });
      assert.ok(impersonation.error);

      const ticket = await one.from('tickets').insert({ user_id: oneUser.id, category: 'Technical Issue', subject: 'Private validation ticket', body: 'Private ticket body' }).select('id').single();
      assert.ifError(ticket.error); created.ticket = ticket.data.id;
      await expectNoRows(two.from('tickets').select('id').eq('id', created.ticket), 'another teacher ticket must be invisible');

      const mentorReady = await service.from('profiles').update({ open_to_mentor: true }).eq('id', twoUser.id);
      assert.ifError(mentorReady.error);
      const mentorship = await one.from('mentorships').insert({ mentee_id: oneUser.id, mentor_id: twoUser.id, topic: 'Validation', message: 'Please validate mentorship privacy.' }).select('id').single();
      assert.ifError(mentorship.error); created.mentorship = mentorship.data.id;
      await expectNoRows(three.from('mentorships').update({ status: 'active' }).eq('id', created.mentorship).select('id'), 'unrelated mentorship update');

      const audit = await service.from('audit_log').insert({ user_id: oneUser.id, action: `${prefix}.audit` }).select('id').single();
      assert.ifError(audit.error); created.audit = audit.data.id;
      const adminAudit = await administrator.from('audit_log').select('id').eq('id', created.audit);
      assert.ifError(adminAudit.error); assert.equal(adminAudit.data.length, 1);
      await expectNoRows(one.from('audit_log').select('id').eq('id', created.audit), 'teacher must not read admin audit data');
    });

    await t.test('workshops, communities and notifications enforce ownership', async () => {
      const workshop = await service.from('workshops').insert({
        title: `${prefix} workshop`, description: 'Disposable validation workshop',
        facilitator: 'Integration Test', starts_at: new Date(Date.now() + 86400000).toISOString(),
      }).select('id').single();
      assert.ifError(workshop.error); created.workshop = workshop.data.id;

      const registration = await one.from('workshop_regs').insert({ user_id: oneUser.id, workshop_id: created.workshop });
      assert.ifError(registration.error);
      const foreignRegistration = await one.from('workshop_regs').insert({ user_id: twoUser.id, workshop_id: created.workshop });
      assert.ok(foreignRegistration.error, 'teacher must not register another user');
      await expectNoRows(two.from('workshop_regs').select('*').eq('workshop_id', created.workshop), 'registration must be private');
      await one.from('workshop_regs').update({ attended: true }).match({ user_id: oneUser.id, workshop_id: created.workshop });
      const attendanceBeforeAdmin = await service.from('workshop_regs').select('attended').match({ user_id: oneUser.id, workshop_id: created.workshop }).single();
      assert.ifError(attendanceBeforeAdmin.error);
      assert.equal(attendanceBeforeAdmin.data.attended, false, 'teacher must not certify their own attendance');
      const adminAttendance = await administrator.from('workshop_regs').update({
        attended: true, attendance_status: 'attended', attendance_verified_at: new Date().toISOString(), attendance_verified_by: adminUser.id,
      }).match({ user_id: oneUser.id, workshop_id: created.workshop });
      assert.ifError(adminAttendance.error);

      const community = await service.from('communities').insert({ name: `${prefix} community`, description: 'Disposable validation community' }).select('id').single();
      assert.ifError(community.error); created.community = community.data.id;
      const post = await one.from('posts').insert({ community_id: created.community, user_id: oneUser.id, title: 'Validation post', body: 'Public community content' }).select('id').single();
      assert.ifError(post.error); created.post = post.data.id;
      const impersonatedPost = await one.from('posts').insert({ community_id: created.community, user_id: twoUser.id, title: 'Impersonation', body: 'Forbidden' });
      assert.ok(impersonatedPost.error);
      const crossEdit = await two.from('posts').update({ body: 'Forbidden edit' }).eq('id', created.post).select('id');
      assert.ifError(crossEdit.error); assert.deepEqual(crossEdit.data, []);
      const reply = await two.from('replies').insert({ post_id: created.post, user_id: twoUser.id, body: 'Validation reply' }).select('id').single();
      assert.ifError(reply.error); created.reply = reply.data.id;

      const notification = await service.from('notifications').insert({ user_id: oneUser.id, text: 'Private validation notification' }).select('id').single();
      assert.ifError(notification.error); created.notification = notification.data.id;
      await expectNoRows(two.from('notifications').select('*').eq('id', created.notification), 'notification must be private');
      const crossRead = await two.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', created.notification).select('id');
      assert.ifError(crossRead.error); assert.deepEqual(crossRead.data, []);
      const ownerRead = await one.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', created.notification).select('id');
      assert.ifError(ownerRead.error); assert.equal(ownerRead.data.length, 1);
    });

    await t.test('Storage ownership, privacy, MIME and size controls', async () => {
      const avatarPath = `${oneUser.id}/${prefix}.png`;
      const avatar = await one.storage.from('profile-photos').upload(avatarPath, Buffer.from('not-decoded-by-storage'), { contentType: 'image/png' });
      assert.ifError(avatar.error); objects.push(['profile-photos', avatarPath]);
      const crossAvatar = await two.storage.from('profile-photos').upload(`${oneUser.id}/${prefix}-cross.png`, Buffer.from('x'), { contentType: 'image/png' });
      assert.ok(crossAvatar.error);

      const documentPath = `${oneUser.id}/${prefix}.pdf`;
      const document = await one.storage.from('professional-documents').upload(documentPath, Buffer.from('%PDF-1.4\n% test'), { contentType: 'application/pdf' });
      assert.ifError(document.error); objects.push(['professional-documents', documentPath]);
      const ownerSigned = await one.storage.from('professional-documents').createSignedUrl(documentPath, 60);
      assert.ifError(ownerSigned.error); assert.ok(ownerSigned.data.signedUrl);
      const crossDownload = await two.storage.from('professional-documents').download(documentPath);
      assert.ok(crossDownload.error);
      await two.storage.from('professional-documents').remove([documentPath]);
      const ownerDownloadAfterCrossDelete = await one.storage.from('professional-documents').download(documentPath);
      assert.ifError(ownerDownloadAfterCrossDelete.error);

      const badMime = await one.storage.from('professional-documents').upload(`${oneUser.id}/${prefix}.exe`, Buffer.from('bad'), { contentType: 'application/octet-stream' });
      assert.ok(badMime.error);
      const tooLarge = await one.storage.from('professional-documents').upload(`${oneUser.id}/${prefix}-large.pdf`, Buffer.alloc(10485761), { contentType: 'application/pdf' });
      assert.ok(tooLarge.error);

      const teacherCourseUpload = await one.storage.from('course-resources').upload(`courses/${created.course}/${prefix}.pdf`, Buffer.from('%PDF test'), { contentType: 'application/pdf' });
      assert.ok(teacherCourseUpload.error);
      const adminCoursePath = `courses/${created.course}/${prefix}.pdf`;
      const adminCourseUpload = await administrator.storage.from('course-resources').upload(adminCoursePath, Buffer.from('%PDF test'), { contentType: 'application/pdf' });
      assert.ifError(adminCourseUpload.error); objects.push(['course-resources', adminCoursePath]);

      const communityPath = `${oneUser.id}/${prefix}.png`;
      const community = await one.storage.from('community-attachments').upload(communityPath, Buffer.from('image test'), { contentType: 'image/png' });
      assert.ifError(community.error); objects.push(['community-attachments', communityPath]);
      const communityRead = await two.storage.from('community-attachments').download(communityPath);
      assert.ifError(communityRead.error);
    });
  } finally {
    const service = url && secretKey ? createClient(url, secretKey, options) : null;
    if (service) {
      for (const [bucket, object] of objects.reverse()) await service.storage.from(bucket).remove([object]);
      if (created.audit) await service.from('audit_log').delete().eq('id', created.audit);
      if (created.notification) await service.from('notifications').delete().eq('id', created.notification);
      if (created.reply) await service.from('replies').delete().eq('id', created.reply);
      if (created.post) await service.from('posts').delete().eq('id', created.post);
      if (created.community) await service.from('communities').delete().eq('id', created.community);
      if (created.workshop) await service.from('workshops').delete().eq('id', created.workshop);
      if (created.job) await service.from('jobs').delete().eq('id', created.job);
      if (created.message) await service.from('messages').delete().eq('id', created.message);
      if (created.mentorship) await service.from('mentorships').delete().eq('id', created.mentorship);
      if (created.ticket) await service.from('tickets').delete().eq('id', created.ticket);
      if (created.connection) await service.from('connections').delete().eq('id', created.connection);
      if (created.lesson) await service.from('lesson_progress').delete().eq('lesson_id', created.lesson);
      if (created.course) {
        await service.from('enrollments').delete().eq('course_id', created.course);
        await service.from('courses').delete().eq('id', created.course);
      }
      for (const user of users) await service.auth.admin.deleteUser(user.id);
    }
  }
});
