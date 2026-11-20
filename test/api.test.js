'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const routeInventorySnapshot = require('./fixtures/route-inventory.json');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'teachersinn-test-'));
process.env.TEACHERSINN_DATA_DIR = dataDir;
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'AdminPassword2026';
process.env.TRUST_PROXY = '1';

const server = require('../src/server');
const { db, get, run, tx, DB_PATH } = require('../src/db');
const { hashPassword, randomToken, sha256 } = require('../src/security');

let baseUrl;
let sequence = 0;
let adminSession;

test('route inventory preserves unique method, path and access contracts', () => {
  assert.deepEqual(server.routeInventory,routeInventorySnapshot);
  const keys=server.routeInventory.map(route=>`${route.method} ${route.pattern}`);
  assert.equal(new Set(keys).size,keys.length);
  assert.deepEqual(server.routeInventory.find(route=>route.pattern==='/api/certificates/verify/:code'),{method:'GET',pattern:'/api/certificates/verify/:code',access:'public'});
  assert.equal(server.routeInventory.find(route=>route.pattern==='/api/admin/users').access,'admin');
});

class Client {
  constructor() { this.cookie = ''; this.csrf = ''; }

  async request(method, route, body, options = {}) {
    const headers = { Accept: 'application/json', ...(options.headers || {}) };
    if (this.cookie && options.cookie !== false) headers.Cookie = this.cookie;
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      if (this.csrf && options.csrf !== false) headers['X-CSRF-Token'] = this.csrf;
    }
    if (options.cookieValue !== undefined) headers.Cookie = options.cookieValue;
    const response = await fetch(baseUrl + route, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';', 1)[0];
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  }

  async refreshSession() {
    const response = await this.request('GET', '/api/me');
    assert.equal(response.status, 200);
    this.csrf = response.data.csrf || '';
    return response.data;
  }
}

async function register(prefix = 'teacher') {
  sequence += 1;
  const email = `${prefix}.${sequence}@test.local`;
  const password = `SafePassword${sequence}2026`;
  run(`INSERT INTO users (name,email,password_hash,designation,school,subjects,consent_at)
    VALUES (?,?,?,?,?,?,?)`, `${prefix} ${sequence}`, email, hashPassword(password), 'Teacher', 'Test School', 'Science', new Date().toISOString());
  const session = await login(email, password);
  return { client: session.client, email, user: session.user };
}

async function login(email, password) {
  const client = new Client();
  const response = await client.request('POST', '/api/auth/login', { email, password });
  assert.equal(response.status, 200);
  const session = await client.refreshSession();
  return { client, user: session.user };
}

async function getAdmin() {
  if (!adminSession) adminSession = await login('admin@test.local', 'AdminPassword2026');
  return adminSession;
}

function authenticatedUser(prefix = 'teacher') {
  sequence += 1;
  const email = `${prefix}.${sequence}@test.local`;
  const password = `SafePassword${sequence}2026`;
  const inserted = run(`INSERT INTO users (name,email,password_hash,designation,school,subjects,consent_at)
    VALUES (?,?,?,?,?,?,?)`, `${prefix} ${sequence}`, email, hashPassword(password), 'Teacher', 'Test School', 'Science', new Date().toISOString());
  const user = { id: Number(inserted.lastInsertRowid), email };
  const token = randomToken(32); const csrf = randomToken(24); const now = Date.now();
  run('INSERT INTO sessions (token_hash,user_id,csrf_token,created_at,last_seen,expires_at) VALUES (?,?,?,?,?,?)', sha256(token), user.id, csrf, now, now, now + 3600000);
  const client = new Client(); client.cookie = `tin_sid=${token}`; client.csrf = csrf;
  return { client, email, user, password };
}

test.before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('trusted HTTPS proxy requests receive host-only secure session cookies', async () => {
  const client = new Client();
  const response = await client.request('POST', '/api/auth/login', {
    email: 'admin@test.local', password: 'AdminPassword2026',
  }, { headers: { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '192.0.2.10' } });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /^__Host-tin_sid=/);
  assert.match(cookie, /; Secure(?:;|$)/);
  assert.match(cookie, /; HttpOnly(?:;|$)/);
  assert.match(cookie, /; SameSite=Strict(?:;|$)/);
});

test('isolated SQLite schema passes integrity and foreign-key validation', () => {
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
});

test('failed transactions roll back every partial write', () => {
  const before = Number(get('SELECT COUNT(*) n FROM notifications').n);
  assert.throws(() => tx(() => {
    run('INSERT INTO notifications (user_id,text) VALUES (?,?)', 1, 'Must roll back');
    run('INSERT INTO notifications (user_id,text) VALUES (?,?)', 999999999, 'Foreign key failure');
  }));
  assert.equal(Number(get('SELECT COUNT(*) n FROM notifications').n), before);
});

test('lesson plans support secure ownership, discovery, editing and duplicate-safe creation', async () => {
  const alice = authenticatedUser('planner-alice');
  const bob = authenticatedUser('planner-bob');
  const body = { title: 'Fractions & <models>', subject: 'Mathematics', grade: '5', plan_date: '2099-06-15', duration_min: 45, objectives: 'Compare fractions', activities: 'Use visual models', assessment: 'Exit question', materials: 'Fraction strips', reflection: '' };
  const created = await alice.client.request('POST', '/api/plans', body);
  assert.equal(created.status, 200);
  const retry = await alice.client.request('POST', '/api/plans', body);
  assert.equal(retry.data.id, created.data.id);
  assert.equal(retry.data.duplicate, true);

  const overview = await alice.client.request('GET', '/api/plans/overview');
  assert.deepEqual(overview.data, { total: 1, upcoming: 1, undated: 0, thisWeek: 0 });
  const filtered = await alice.client.request('GET', '/api/plans?q=visual&scope=upcoming&subject=Math&grade=5');
  assert.equal(filtered.data.length, 1);
  assert.equal(filtered.data[0].title, body.title);
  assert.equal((await alice.client.request('GET', '/api/plans?scope=past')).data.length, 0);

  assert.equal((await bob.client.request('GET', `/api/plans/${created.data.id}`)).status, 404);
  assert.equal((await bob.client.request('PUT', `/api/plans/${created.data.id}`, { ...body, title: 'Stolen plan' })).status, 404);
  assert.equal((await bob.client.request('POST', `/api/plans/${created.data.id}/duplicate`, {})).status, 404);
  assert.equal((await bob.client.request('DELETE', `/api/plans/${created.data.id}`, {})).status, 404);

  const changed = { ...body, title: 'Comparing fractions', plan_date: '' };
  assert.equal((await alice.client.request('PUT', `/api/plans/${created.data.id}`, changed)).status, 200);
  const detail = await alice.client.request('GET', `/api/plans/${created.data.id}`);
  assert.equal(detail.data.title, changed.title);
  assert.equal(detail.data.plan_date, '');
  const copy = await alice.client.request('POST', `/api/plans/${created.data.id}/duplicate`, {});
  assert.equal(copy.status, 200);
  const copyDetail = await alice.client.request('GET', `/api/plans/${copy.data.id}`);
  assert.equal(copyDetail.data.title, 'Comparing fractions (Copy)');
  assert.equal(copyDetail.data.plan_date, '');
  assert.equal(copyDetail.data.user_id, alice.user.id);
  assert.equal((await alice.client.request('DELETE', `/api/plans/${created.data.id}`, {})).status, 200);
  assert.equal((await alice.client.request('GET', `/api/plans/${created.data.id}`)).status, 404);
});

test('notification center persists owner-scoped read state, categories and pagination', async () => {
  const alice = authenticatedUser('notify-alice'); const bob = authenticatedUser('notify-bob');
  const links = ['#/messages/2', '#/network/requests', '#/post/4', '#/workshops', '#/course/3', '#/support', 'javascript:alert(1)'];
  for (let i = 0; i < 25; i += 1) run('INSERT INTO notifications (user_id,text,link,created_at) VALUES (?,?,?,datetime(\'now\',?))', alice.user.id, `Activity ${i}`, links[i % links.length], `-${i} minutes`);
  run("INSERT INTO notifications (user_id,text,link) VALUES (?,?,?)", bob.user.id, 'Bob only', '#/network');

  const preview = await alice.client.request('GET', '/api/notifications/preview');
  assert.equal(preview.data.unread, 25); assert.equal(preview.data.items.length, 5);
  const first = await alice.client.request('GET', '/api/notifications?state=unread&page=1');
  assert.equal(first.data.total, 25); assert.equal(first.data.items.length, 20); assert.equal(first.data.pages, 2);
  assert.equal(first.data.items[0].text, 'Activity 0');
  const messages = await alice.client.request('GET', '/api/notifications?category=messages');
  assert.equal(messages.data.items.every(n => n.category === 'messages'), true);
  const unsafe = first.data.items.find(n => n.text === 'Activity 6'); assert.equal(unsafe.link, '');

  const target = first.data.items[0].id;
  assert.equal((await bob.client.request('POST', `/api/notifications/${target}/read`, {})).status, 404);
  assert.equal((await alice.client.request('POST', `/api/notifications/${target}/read`, {})).data.unread, 24);
  assert.ok(get('SELECT read_at FROM notifications WHERE id=? AND user_id=?', target, alice.user.id).read_at);
  assert.equal((await alice.client.request('GET', '/api/notifications?state=read')).data.total, 1);
  const allRead = await alice.client.request('POST', '/api/notifications/read', {});
  assert.equal(allRead.data.updated, 24); assert.equal(allRead.data.unread, 0);
  assert.equal(get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', bob.user.id).n, 1);
  assert.equal((await alice.client.request('GET', '/api/notifications/preview')).data.unread, 0);
});

test('administrator management APIs expose real aggregates without private teacher records', async () => {
  const teacher = authenticatedUser('admin-scope'); const { client: admin } = await getAdmin();
  const paths = ['/api/admin/overview','/api/admin/analytics?period=all','/api/admin/courses','/api/admin/workshops','/api/admin/jobs','/api/admin/discussions','/api/admin/mentorships','/api/admin/audit-log'];
  for (const path of paths) { assert.equal((await teacher.client.request('GET', path)).status, 403, path); assert.equal((await admin.request('GET', path)).status, 200, path); }

  const overview = await admin.request('GET', '/api/admin/overview');
  assert.equal(overview.data.users, get('SELECT COUNT(*) n FROM users').n);
  assert.equal(overview.data.enrollments, get('SELECT COUNT(*) n FROM enrollments').n);
  assert.equal(overview.data.applications, get('SELECT COUNT(*) n FROM job_applications').n);
  const analytics = await admin.request('GET', '/api/admin/analytics?period=all');
  assert.equal(analytics.data.discussions, get('SELECT COUNT(*) n FROM posts').n);
  assert.equal(analytics.data.replies, get('SELECT COUNT(*) n FROM replies').n);
  assert.equal(analytics.data.certificates, get('SELECT COUNT(*) n FROM enrollments WHERE certificate_code IS NOT NULL').n);

  const filtered = await admin.request('GET', `/api/admin/users?q=${encodeURIComponent(teacher.email)}&role=educator&status=active&recent=1`);
  assert.equal(filtered.data.length, 1); assert.equal(filtered.data[0].id, teacher.user.id); assert.equal(typeof filtered.data[0].profile_completion, 'number');
  const detail = await admin.request('GET', `/api/admin/users/${teacher.user.id}`);
  assert.equal(detail.data.email, teacher.email);
  for (const privateField of ['password_hash','failed_logins','locked_until','consent_at']) assert.equal(Object.hasOwn(detail.data, privateField), false);
  assert.equal((await teacher.client.request('GET', `/api/admin/users/${teacher.user.id}`)).status, 403);

  run("INSERT INTO audit_log (user_id,action,detail,ip) VALUES (?,?,?,?)", teacher.user.id, 'admin.test_marker', 'phase eleven', '127.0.0.1');
  const auditLog = await admin.request('GET', '/api/admin/audit-log?q=phase%20eleven&page=1');
  assert.equal(auditLog.data.total, 1); assert.equal(auditLog.data.items[0].action, 'admin.test_marker');
  assert.equal(auditLog.data.items.every((row, index, rows) => index === 0 || row.id < rows[index - 1].id), true);
});

test('settings remain owner-scoped, validate profile changes and enforce notification preferences', async () => {
  const alice=authenticatedUser('settings-alice'); const alicePassword=`SafePassword${sequence}2026`; const bob=authenticatedUser('settings-bob');
  const settings=await alice.client.request('GET','/api/settings'); assert.equal(settings.status,200); assert.equal(settings.data.account.email,alice.email); assert.equal(settings.data.account.role,'educator');
  assert.equal(Object.hasOwn(settings.data.account,'password_hash'),false); assert.equal(settings.data.notifications.messages,1);
  const me=await alice.client.request('GET','/api/me'); assert.equal(me.data.user.role,'educator');
  const profile={...me.data.user,name:'Settings Teacher',city:'Chennai',state:'Tamil Nadu',bio:'Updated professional biography.',directory_visible:false,open_to_mentor:false,role:'admin',status:'suspended'};
  assert.equal((await alice.client.request('PUT','/api/profile',profile)).status,200);
  const updated=await alice.client.request('GET','/api/me'); assert.equal(updated.data.user.name,'Settings Teacher'); assert.equal(updated.data.user.directory_visible,0); assert.equal(updated.data.user.role,'educator'); assert.equal(updated.data.user.status,'active');
  assert.equal((await bob.client.request('GET',`/api/educators/${alice.user.id}`)).status,404);

  run("INSERT INTO notifications (user_id,text,link) VALUES (?,?,?)",alice.user.id,'Essential account notice','');
  const prefs={messages:true,connections:false,community:true,workshops:true,learning:true,mentorship:true,support:true};
  assert.equal((await alice.client.request('PUT','/api/settings/notifications',prefs)).status,200);
  assert.equal(get('SELECT connections FROM notification_preferences WHERE user_id=?',alice.user.id).connections,0);
  run('UPDATE users SET directory_visible=1 WHERE id=?',alice.user.id);
  assert.equal((await bob.client.request('POST','/api/connections',{user_id:alice.user.id})).status,200);
  assert.equal(get("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND link='#/network/requests'",alice.user.id).n,0);
  assert.equal(get("SELECT COUNT(*) n FROM notifications WHERE user_id=? AND text='Essential account notice'",alice.user.id).n,1);

  const secondToken=randomToken(32),secondCsrf=randomToken(24),secondNow=Date.now(); run('INSERT INTO sessions (token_hash,user_id,csrf_token,created_at,last_seen,expires_at) VALUES (?,?,?,?,?,?)',sha256(secondToken),alice.user.id,secondCsrf,secondNow,secondNow,secondNow+3600000); const second={client:new Client()}; second.client.cookie=`tin_sid=${secondToken}`; second.client.csrf=secondCsrf;
  assert.equal((await alice.client.request('POST','/api/auth/password',{current:'wrong password',next:'NewSecurePassword2026'})).status,400);
  assert.equal((await alice.client.request('POST','/api/auth/password',{current:alicePassword,next:'NewSecurePassword2026'})).status,200);
  assert.equal((await second.client.request('GET','/api/me')).data.user,null);
  assert.equal((await alice.client.request('GET','/api/me')).data.user.email,alice.email);
});

test('missing, malformed and unexpected cookies never authenticate or crash', async () => {
  const anonymous = new Client();
  const missing = await anonymous.request('GET', '/api/me');
  assert.equal(missing.status, 200);
  assert.equal(missing.data.user, null);

  const malformed = await anonymous.request('GET', '/api/me', undefined, { cookieValue: 'broken=%ZZ' });
  assert.equal(malformed.status, 200);
  assert.equal(malformed.data.user, null);

  const protectedMalformed = await anonymous.request('GET', '/api/dashboard', undefined, { cookieValue: 'tin_sid=%E0%A4%A' });
  assert.equal(protectedMalformed.status, 401);

  const unexpected = await anonymous.request('GET', '/api/me', undefined, { cookieValue: 'other=value' });
  assert.equal(unexpected.status, 200);
  assert.equal(unexpected.data.user, null);

  const valid = await register('cookie');
  const authenticated = await valid.client.request('GET', '/api/me');
  assert.equal(authenticated.status, 200);
  assert.equal(authenticated.data.user.email, valid.email);
  const validWithMalformedPair = await valid.client.request('GET', '/api/me', undefined, {
    cookieValue: `${valid.client.cookie}; broken=%ZZ`,
  });
  assert.equal(validWithMalformedPair.status, 200);
  assert.equal(validWithMalformedPair.data.user.email, valid.email);
});

test('registration and login continue to create valid sessions', async () => {
  const client = new Client();
  const registered = await client.request('POST', '/api/auth/register', {
    name: 'Registration Tester',
    email: 'registration@test.local',
    password: 'ReliablePassword2026',
    consent: true,
    designation: 'Teacher',
    school: 'Test School',
    subjects: 'English',
  });
  assert.equal(registered.status, 200);
  const session = await client.refreshSession();
  assert.equal(session.user.email, 'registration@test.local');

  const relogin = await login('registration@test.local', 'ReliablePassword2026');
  assert.equal(relogin.user.email, 'registration@test.local');
});

test('protected APIs reject anonymous requests and authenticated writes without CSRF', async () => {
  const anonymous = new Client();
  assert.equal((await anonymous.request('GET', '/api/dashboard')).status, 401);

  const { client, user } = await register('csrf');
  const payload = {
    name: user.name,
    designation: user.designation,
    school: user.school,
    subjects: user.subjects,
    grades: user.grades,
    board: user.board,
    city: user.city,
    state: user.state,
    bio: user.bio,
    experience_years: user.experience_years,
    open_to_mentor: false,
    directory_visible: true,
  };
  assert.equal((await client.request('PUT', '/api/profile', payload, { csrf: false })).status, 403);
  assert.equal((await client.request('PUT', '/api/profile', payload)).status, 200);
});

test('closed support tickets reject further replies', async () => {
  const { client: teacher } = await register('ticket');
  const created = await teacher.request('POST', '/api/tickets', {
    category: 'Technical Issue', subject: 'A reproducible test issue', body: 'This ticket exists for regression testing.',
  });
  assert.equal(created.status, 200);

  const { client: admin } = await getAdmin();
  assert.equal((await admin.request('POST', `/api/admin/tickets/${created.data.id}`, { status: 'closed' })).status, 200);

  const reply = await teacher.request('POST', `/api/tickets/${created.data.id}/replies`, { body: 'This reply must be rejected.' });
  assert.equal(reply.status, 409);
  assert.match(reply.data.error, /closed/i);
});

test('mentorships enforce valid lifecycle transitions', async () => {
  const { client: mentee } = await register('mentee');
  const mentorAccount = await register('mentor');
  const { client: admin } = await getAdmin();
  assert.equal((await admin.request('POST', `/api/admin/users/${mentorAccount.user.id}`, { role: 'mentor' })).status, 200);

  const request = await mentee.request('POST', '/api/mentorships', {
    mentor_id: mentorAccount.user.id, topic: 'Classroom planning', message: 'Please help me improve my planning workflow.',
  });
  assert.equal(request.status, 200);
  const mine = await mentee.request('GET', '/api/mentorships');
  const mentorship = mine.data.find((item) => item.mentor_id === mentorAccount.user.id);
  assert.ok(mentorship);

  assert.equal((await mentorAccount.client.request('POST', `/api/mentorships/${mentorship.id}/respond`, { action: 'complete' })).status, 409);
  assert.equal((await mentorAccount.client.request('POST', `/api/mentorships/${mentorship.id}/respond`, { action: 'accept' })).status, 200);
  assert.equal((await mentorAccount.client.request('POST', `/api/mentorships/${mentorship.id}/respond`, { action: 'accept' })).status, 409);
  assert.equal((await mentorAccount.client.request('POST', `/api/mentorships/${mentorship.id}/respond`, { action: 'decline' })).status, 409);
  assert.equal((await mentorAccount.client.request('POST', `/api/mentorships/${mentorship.id}/respond`, { action: 'complete' })).status, 200);
  assert.equal((await mentorAccount.client.request('POST', `/api/mentorships/${mentorship.id}/respond`, { action: 'complete' })).status, 409);
});

test('missing tutorials and jobs return 404', async () => {
  const { client: teacher } = await register('missing');
  assert.equal((await teacher.request('POST', '/api/tutorials/999999/save', {})).status, 404);
  const tutorials = await teacher.request('GET', '/api/tutorials');
  assert.ok(tutorials.data.length > 0);
  assert.equal((await teacher.request('POST', `/api/tutorials/${tutorials.data[0].id}/save`, {})).status, 200);

  const { client: admin } = await getAdmin();
  assert.equal((await admin.request('POST', '/api/admin/jobs/999999/close', {})).status, 404);
  const jobs = await admin.request('GET', '/api/jobs');
  assert.ok(jobs.data.length > 0);
  assert.equal((await admin.request('POST', `/api/admin/jobs/${jobs.data[0].id}/close`, {})).status, 200);
});

test('course enrollment, protected lessons, completion and certificate verification remain secure', async () => {
  const account = await getAdmin();
  const catalogue = await account.client.request('GET', '/api/courses');
  assert.equal(catalogue.status, 200);
  const course = catalogue.data.find((item) => item.lessons > 1);
  assert.ok(course, 'seed data must include a multi-lesson course');

  let detail = await account.client.request('GET', `/api/courses/${course.id}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.data.lessons[0].body, 'the first lesson is available as a preview');
  assert.equal(detail.data.lessons[1].body, null);
  assert.equal(detail.data.lessons[1].locked, true);
  const protectedLesson = detail.data.lessons[1].id;
  assert.equal((await account.client.request('POST', `/api/lessons/${protectedLesson}/complete`, {})).status, 403);

  assert.equal((await account.client.request('POST', `/api/courses/${course.id}/enroll`, {})).status, 200);
  detail = await account.client.request('GET', `/api/courses/${course.id}`);
  assert.ok(detail.data.enrollment);
  assert.equal(detail.data.lessons.some((lesson) => lesson.locked), false);

  let completion;
  for (const lesson of detail.data.lessons) {
    completion = await account.client.request('POST', `/api/lessons/${lesson.id}/complete`, {});
    assert.equal(completion.status, 200);
  }
  assert.equal(completion.data.courseComplete, true);
  assert.match(completion.data.certificate, /^TIN-[A-F0-9]{10}$/);
  const code = completion.data.certificate;

  const duplicate = await account.client.request('POST', `/api/lessons/${detail.data.lessons[0].id}/complete`, {});
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.certificate, null);
  const certificates = await account.client.request('GET', '/api/certificates');
  assert.equal(certificates.data.filter((item) => item.course_id === course.id).length, 1);
  assert.equal(certificates.data.find((item) => item.course_id === course.id).certificate_code, code);

  const anonymousCertificates = await new Client().request('GET', '/api/certificates');
  assert.equal(anonymousCertificates.status, 401);
  const verification = await new Client().request('GET', `/api/certificates/verify/${code}`);
  assert.equal(verification.status, 200);
  assert.equal(verification.data.valid, true);
  assert.equal(Object.hasOwn(verification.data, 'email'), false);
  assert.equal(Object.hasOwn(verification.data, 'user_id'), false);
});

test('administrators can safely manage the complete course lifecycle and issue privacy-safe public certificates', async () => {
  const { client: admin } = await getAdmin();
  const teacherA = authenticatedUser('course-owner');
  const teacherB = authenticatedUser('course-outsider');
  const metadata = {
    title: 'Evidence-Informed Classroom Practice', category: 'Pedagogy', level: 'Intermediate',
    summary: 'A practical course for applying classroom evidence with confidence.',
    description: 'Teachers examine evidence, plan a classroom intervention, and reflect on measurable learning outcomes.',
    instructor: 'TeachersInn Faculty', cpd_hours: 3, estimated_minutes: 50,
    thumbnail: '', objectives: 'Evaluate evidence\nPlan an intervention', prerequisites: 'Teaching experience',
  };

  const forbidden = await teacherA.client.request('POST', '/api/admin/courses', { ...metadata, status: 'draft', lessons: [] });
  assert.equal(forbidden.status, 403);

  const created = await admin.request('POST', '/api/admin/courses', { ...metadata, status: 'draft', lessons: [] });
  assert.equal(created.status, 200);
  assert.equal(created.data.status, 'draft');
  const courseId = created.data.id;

  const draftCatalogue = await teacherA.client.request('GET', '/api/courses');
  assert.equal(draftCatalogue.data.some((course) => course.id === courseId), false);
  const emptyPublish = await admin.request('POST', `/api/admin/courses/${courseId}/status`, { status: 'published' });
  assert.equal(emptyPublish.status, 409);

  const updated = await admin.request('PUT', `/api/admin/courses/${courseId}`, { ...metadata, title: 'Evidence-Informed Teaching Practice' });
  assert.equal(updated.status, 200);
  const curriculum = [
    { title: 'Interpreting evidence', body: 'Learn to distinguish useful classroom evidence from unsupported claims.', minutes: 20 },
    { title: 'Planning an intervention', body: 'Build a small, measurable classroom intervention and reflection cycle.', minutes: 30 },
  ];
  assert.equal((await admin.request('PUT', `/api/admin/courses/${courseId}/lessons`, { lessons: curriculum })).status, 200);
  assert.equal((await admin.request('POST', `/api/admin/courses/${courseId}/status`, { status: 'published' })).status, 200);

  const publishedCatalogue = await teacherA.client.request('GET', '/api/courses');
  assert.equal(publishedCatalogue.data.some((course) => course.id === courseId), true);
  assert.equal((await teacherA.client.request('POST', `/api/courses/${courseId}/enroll`, {})).status, 200);
  const lockedCurriculum = await admin.request('PUT', `/api/admin/courses/${courseId}/lessons`, { lessons: curriculum.slice(0, 1) });
  assert.equal(lockedCurriculum.status, 409);

  let detail = await teacherA.client.request('GET', `/api/courses/${courseId}`);
  let completion;
  for (const lesson of detail.data.lessons) {
    completion = await teacherA.client.request('POST', `/api/lessons/${lesson.id}/complete`, {});
    assert.equal(completion.status, 200);
  }
  const code = completion.data.certificate;
  assert.match(code, /^TIN-[A-F0-9]{10}$/);

  assert.equal((await admin.request('POST', `/api/admin/courses/${courseId}/status`, { status: 'archived' })).status, 200);
  assert.equal((await teacherB.client.request('GET', '/api/courses')).data.some((course) => course.id === courseId), false);
  detail = await teacherA.client.request('GET', `/api/courses/${courseId}`);
  assert.equal(detail.status, 200, 'an enrolled teacher retains access after archival');

  const verification = await new Client().request('GET', `/api/certificates/verify/${code}`);
  assert.equal(verification.status, 200);
  assert.equal(verification.data.status, 'verified');
  assert.equal(verification.data.issuer, 'TeachersInn by SchoolExpert');
  assert.equal(verification.data.verification_url, `https://teachersinn.schoolexpert.in/verify?code=${code}`);
  assert.deepEqual(Object.keys(verification.data).sort(), [
    'certificate_code', 'completed_at', 'cpd_hours', 'issuer', 'name', 'status', 'title', 'valid', 'verification_url',
  ].sort());
  assert.equal((await new Client().request('GET', '/api/certificates/verify/TIN-NOTVALID00')).status, 404);

  const directPage = await fetch(`${baseUrl}/verify?code=${encodeURIComponent(code)}`);
  assert.equal(directPage.status, 200);
  assert.match(directPage.headers.get('content-type') || '', /text\/html/);
  assert.match(await directPage.text(), /TeachersInn/);
});

test('workshop registration is persistent, duplicate-safe and cannot self-award attendance', async () => {
  const account = await register('workshop');
  const startsAt = new Date(Date.now() + 14 * 86400000).toISOString();
  const created = run(`INSERT INTO workshops (title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, 'Registration test workshop', 'Workshop used to verify registration persistence and attendance security.', 'Test Facilitator', 'Testing', 'Online', 'TeachersInn Live', startsAt, 75, 20, 2);
  const workshopId = Number(created.lastInsertRowid);

  assert.equal((await account.client.request('POST', `/api/workshops/${workshopId}/register`, {})).status, 200);
  const duplicate = await account.client.request('POST', `/api/workshops/${workshopId}/register`, {});
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.data.alreadyRegistered, true);
  assert.equal(get('SELECT COUNT(*) n FROM workshop_regs WHERE user_id=? AND workshop_id=?', account.user.id, workshopId).n, 1);
  const attendanceAttempt = await account.client.request('POST', `/api/workshops/${workshopId}/attendance`, { attended: true });
  assert.equal(attendanceAttempt.status, 404);
  assert.equal(get('SELECT attended FROM workshop_regs WHERE user_id=? AND workshop_id=?', account.user.id, workshopId).attended, 0);

  const catalogue = await account.client.request('GET', '/api/workshops');
  const workshop = catalogue.data.find((item) => item.id === workshopId);
  assert.equal(workshop.registered, 1);
  assert.equal(workshop.attended, 0);
  assert.ok(workshop.registered_at);
  const dashboard = await account.client.request('GET', '/api/dashboard');
  assert.equal(dashboard.data.stats.workshops >= 1, true);
  assert.equal(dashboard.data.cpd.workshops, 0);

  const adminAttendanceAttempt = await account.client.request('POST', `/api/admin/workshops/${workshopId}/attendance`, { attended: true });
  assert.equal(adminAttendanceAttempt.status, 404);
  assert.equal(get('SELECT attended FROM workshop_regs WHERE user_id=? AND workshop_id=?', account.user.id, workshopId).attended, 0);

  assert.equal((await account.client.request('POST', `/api/workshops/${workshopId}/cancel`, {})).status, 200);
  const afterCancel = await account.client.request('GET', '/api/workshops');
  assert.equal(afterCancel.data.find((item) => item.id === workshopId).registered, 0);
});

test('workshop CPD requires verified attendance while course CPD remains unchanged', async () => {
  const account = await register('cpd');
  const startsAt = new Date(Date.now() - 7 * 86400000).toISOString();
  const workshop = run(`INSERT INTO workshops (title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, 'Past test workshop', 'Regression test workshop description.', 'Test Facilitator', 'Testing', 'Online', 'Test', startsAt, 60, 10, 3);
  run('INSERT INTO workshop_regs (user_id,workshop_id,attended) VALUES (?,?,0)', account.user.id, Number(workshop.lastInsertRowid));

  const course = run('INSERT INTO courses (title,category,level,summary,instructor,cpd_hours) VALUES (?,?,?,?,?,?)',
    'Completed test course', 'Testing', 'Beginner', 'Course used to verify course CPD remains counted.', 'Test Instructor', 4);
  run('INSERT INTO enrollments (user_id,course_id,completed_at,certificate_code) VALUES (?,?,?,?)',
    account.user.id, Number(course.lastInsertRowid), new Date().toISOString(), `TEST-${sequence}`);

  let dashboard = await account.client.request('GET', '/api/dashboard');
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.data.cpd.workshops, 0);
  assert.equal(dashboard.data.cpd.courses, 4);
  assert.equal(dashboard.data.cpd.total, 4);

  run('UPDATE workshop_regs SET attended=1 WHERE user_id=? AND workshop_id=?', account.user.id, Number(workshop.lastInsertRowid));
  dashboard = await account.client.request('GET', '/api/dashboard');
  assert.equal(dashboard.data.cpd.workshops, 3);
  assert.equal(dashboard.data.cpd.courses, 4);
  assert.equal(dashboard.data.cpd.total, 7);
});

test('administrator workshop attendance is authorized, auditable and reverses CPD safely', async () => {
  const teacher = authenticatedUser('attendance');
  const other = authenticatedUser('attendance-other');
  const { client: admin } = await getAdmin();
  const anonymous = new Client();
  const pastStart = new Date(Date.now() - 2 * 86400000).toISOString();
  const futureStart = new Date(Date.now() + 2 * 86400000).toISOString();
  const past = run(`INSERT INTO workshops (title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, 'Verified attendance workshop', 'Past workshop for secure administrator attendance verification.', 'Test Facilitator', 'Testing', 'Online', 'Test', pastStart, 60, 20, 3);
  const otherPast = run(`INSERT INTO workshops (title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, 'Other attendance workshop', 'Second past workshop for cross-workshop validation.', 'Test Facilitator', 'Testing', 'Online', 'Test', pastStart, 60, 20, 2);
  const future = run(`INSERT INTO workshops (title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, 'Future attendance workshop', 'Future workshop that must reject premature verification.', 'Test Facilitator', 'Testing', 'Online', 'Test', futureStart, 60, 20, 4);
  const pastId = Number(past.lastInsertRowid); const otherPastId = Number(otherPast.lastInsertRowid); const futureId = Number(future.lastInsertRowid);
  run('INSERT INTO workshop_regs (user_id,workshop_id) VALUES (?,?)', teacher.user.id, pastId);
  run('INSERT INTO workshop_regs (user_id,workshop_id) VALUES (?,?)', other.user.id, otherPastId);
  run('INSERT INTO workshop_regs (user_id,workshop_id) VALUES (?,?)', teacher.user.id, futureId);
  const endpoint = `/api/admin/workshops/${pastId}/registrations/${teacher.user.id}/attendance`;

  assert.equal((await anonymous.request('POST', endpoint, { status: 'attended' })).status, 401);
  assert.equal((await teacher.client.request('POST', endpoint, { status: 'attended' })).status, 403);
  assert.equal((await teacher.client.request('GET', `/api/admin/workshops/${pastId}/registrations`)).status, 403);
  assert.equal((await admin.request('POST', `/api/admin/workshops/999999/registrations/${teacher.user.id}/attendance`, { status: 'attended' })).status, 404);
  assert.equal((await admin.request('POST', `/api/admin/workshops/${pastId}/registrations/999999/attendance`, { status: 'attended' })).status, 404);
  assert.equal((await admin.request('POST', `/api/admin/workshops/${pastId}/registrations/${other.user.id}/attendance`, { status: 'attended' })).status, 404);
  assert.equal((await admin.request('POST', `/api/admin/workshops/${futureId}/registrations/${teacher.user.id}/attendance`, { status: 'attended' })).status, 409);
  assert.equal((await admin.request('POST', endpoint, { status: 'invalid' })).status, 400);

  const attended = await admin.request('POST', endpoint, { status: 'attended' });
  assert.equal(attended.status, 200); assert.equal(attended.data.changed, true);
  assert.equal((await teacher.client.request('GET', '/api/dashboard')).data.cpd.workshops, 3);
  const ownWorkshop = (await teacher.client.request('GET', '/api/workshops')).data.find(w => w.id === pastId);
  assert.equal(ownWorkshop.attendance_status, 'attended');
  assert.ok(ownWorkshop.attendance_verified_at);
  const auditCount = get("SELECT COUNT(*) n FROM audit_log WHERE action='admin.workshop_attendance' AND detail LIKE ?", `workshop=${pastId}%`).n;
  const duplicate = await admin.request('POST', endpoint, { status: 'attended' });
  assert.equal(duplicate.data.changed, false);
  assert.equal(get("SELECT COUNT(*) n FROM audit_log WHERE action='admin.workshop_attendance' AND detail LIKE ?", `workshop=${pastId}%`).n, auditCount);
  assert.equal((await teacher.client.request('GET', '/api/dashboard')).data.cpd.workshops, 3);

  assert.equal((await admin.request('POST', endpoint, { status: 'absent' })).status, 200);
  assert.equal((await teacher.client.request('GET', '/api/dashboard')).data.cpd.workshops, 0);
  assert.equal(get('SELECT attended FROM workshop_regs WHERE user_id=? AND workshop_id=?', teacher.user.id, pastId).attended, 0);
  assert.equal((await admin.request('POST', endpoint, { status: 'attended' })).status, 200);
  assert.equal((await teacher.client.request('GET', '/api/dashboard')).data.cpd.workshops, 3);
  assert.equal(get("SELECT COUNT(*) n FROM audit_log WHERE action='admin.workshop_attendance' AND detail LIKE ?", `workshop=${pastId}%`).n, auditCount + 2);

  run('DELETE FROM workshop_regs WHERE user_id=? AND workshop_id=?', other.user.id, otherPastId);
  assert.equal((await admin.request('POST', `/api/admin/workshops/${otherPastId}/registrations/${other.user.id}/attendance`, { status: 'attended' })).status, 404);
  const registrations = await admin.request('GET', `/api/admin/workshops/${pastId}/registrations?q=${encodeURIComponent(teacher.email)}&status=attended`);
  assert.equal(registrations.status, 200); assert.equal(registrations.data.length, 1); assert.equal(registrations.data[0].email, teacher.email);
  assert.equal(Object.hasOwn(ownWorkshop, 'email'), false);
});

test('educator networking and messaging enforce ownership, privacy and accepted connections', async () => {
  const alice = authenticatedUser('network-alice');
  const bob = authenticatedUser('network-bob');
  const charlie = authenticatedUser('network-charlie');
  run("UPDATE users SET designation='Mathematics Teacher',school='Learning School',subjects='Mathematics, Science',city='Pune',bio='I collaborate on inclusive classroom practice.' WHERE id=?", bob.user.id);

  const directory = await alice.client.request('GET', '/api/educators?q=mathematics&subject=Science&city=Pune&view=all');
  assert.equal(directory.status, 200); assert.equal(directory.data.length, 1); assert.equal(directory.data[0].id, bob.user.id);
  for (const privateField of ['email', 'password_hash', 'failed_logins', 'locked_until', 'consent_at']) assert.equal(Object.hasOwn(directory.data[0], privateField), false);
  const profile = await alice.client.request('GET', `/api/educators/${bob.user.id}`);
  assert.equal(profile.status, 200); assert.equal(profile.data.bio, 'I collaborate on inclusive classroom practice.'); assert.equal(Object.hasOwn(profile.data, 'email'), false);
  assert.equal((await alice.client.request('POST', '/api/connections', { user_id: alice.user.id })).status, 400);

  const requested = await alice.client.request('POST', '/api/connections', { user_id: bob.user.id });
  assert.equal(requested.status, 200); assert.equal(requested.data.status, 'pending');
  const duplicate = await alice.client.request('POST', '/api/connections', { user_id: bob.user.id });
  assert.equal(duplicate.status, 200); assert.equal(get('SELECT COUNT(*) n FROM connections WHERE requester_id=? AND addressee_id=?', alice.user.id, bob.user.id).n, 1);
  const connection = get('SELECT id FROM connections WHERE requester_id=? AND addressee_id=?', alice.user.id, bob.user.id);
  assert.equal((await charlie.client.request('POST', `/api/connections/${connection.id}/respond`, { action: 'accept' })).status, 404);
  assert.equal((await alice.client.request('POST', `/api/messages/${bob.user.id}`, { body: 'Not connected yet' })).status, 403);
  assert.equal((await alice.client.request('GET', `/api/messages/${bob.user.id}`)).status, 403);
  assert.equal((await bob.client.request('POST', `/api/connections/${connection.id}/respond`, { action: 'accept' })).status, 200);

  const accepted = await alice.client.request('GET', '/api/connections');
  assert.equal(accepted.data.accepted.length, 1); assert.equal(accepted.data.accepted[0].id, bob.user.id);
  const connectedFilter = await alice.client.request('GET', '/api/educators?view=connections');
  assert.equal(connectedFilter.data.some(person => person.id === bob.user.id), true);
  const malicious = '<img src=x onerror=alert(1)>';
  assert.equal((await alice.client.request('POST', `/api/messages/${bob.user.id}`, { body: malicious })).status, 200);
  assert.equal((await alice.client.request('POST', `/api/messages/${bob.user.id}`, { body: 'Second message' })).status, 200);
  const summaries = await bob.client.request('GET', '/api/messages');
  assert.equal(summaries.data[0].id, alice.user.id); assert.equal(summaries.data[0].unread, 2); assert.equal(summaries.data[0].last_body, 'Second message');
  const thread = await bob.client.request('GET', `/api/messages/${alice.user.id}`);
  assert.deepEqual(thread.data.messages.map(message => message.body), [malicious, 'Second message']);
  assert.equal(thread.data.messages[0].sender_id, alice.user.id);
  assert.equal((await bob.client.request('GET', '/api/messages')).data[0].unread, 0);
  assert.equal((await charlie.client.request('GET', `/api/messages/${alice.user.id}`)).status, 403);
  assert.equal((await charlie.client.request('POST', `/api/messages/${alice.user.id}`, { body: 'Unauthorized' })).status, 403);
  assert.equal(get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND link=?', bob.user.id, `#/messages/${alice.user.id}`).n, 2);

  assert.equal((await alice.client.request('DELETE', `/api/connections/${connection.id}`, {})).status, 200);
  assert.equal((await alice.client.request('GET', `/api/messages/${bob.user.id}`)).status, 403);
  assert.equal((await alice.client.request('GET', '/api/messages')).data.length, 0);
  run('UPDATE users SET directory_visible=0 WHERE id=?', bob.user.id);
  assert.equal((await alice.client.request('GET', `/api/educators/${bob.user.id}`)).status, 404);
  assert.equal((await alice.client.request('POST', '/api/connections', { user_id: bob.user.id })).status, 404);
  run('UPDATE users SET directory_visible=1 WHERE id=?', bob.user.id);
  const declinedReq = await charlie.client.request('POST', '/api/connections', { user_id: bob.user.id });
  assert.equal(declinedReq.status, 200);
  const declinedId = get('SELECT id FROM connections WHERE requester_id=? AND addressee_id=?', charlie.user.id, bob.user.id).id;
  assert.equal((await alice.client.request('POST', `/api/connections/${declinedId}/respond`, { action: 'decline' })).status, 404);
  assert.equal((await bob.client.request('POST', `/api/connections/${declinedId}/respond`, { action: 'decline' })).status, 200);
  assert.equal(get('SELECT status FROM connections WHERE id=?', declinedId).status, 'declined');
});

test('career profiles, CV drafts and job applications remain owner-scoped and duplicate-safe', async () => {
  const alice = authenticatedUser('career-alice');
  const bob = authenticatedUser('career-bob');
  const anonymous = new Client();
  run("UPDATE users SET designation='Science Teacher',school='Career School',subjects='Science',grades='6-8',board='CBSE',city='Pune',experience_years=5 WHERE id=?", alice.user.id);
  const profileData = { professional_summary: 'Science educator focused on inquiry-led learning.', previous_institutions: 'Learning Academy', responsibilities: 'Planned lessons and supported assessment.', qualifications: 'B.Sc.; B.Ed.', certifications: 'Assessment certificate', training: 'Inclusive education workshop', skills: 'Lesson planning, assessment', specializations: 'Middle school science', cv_template: 'modern' };
  assert.equal((await anonymous.request('GET', '/api/career-profile')).status, 401);
  assert.equal((await alice.client.request('PUT', '/api/career-profile', profileData)).status, 200);
  const aliceProfile = await alice.client.request('GET', '/api/career-profile');
  assert.equal(aliceProfile.data.professional_summary, profileData.professional_summary); assert.equal(aliceProfile.data.cv_template, 'modern');
  const bobProfile = await bob.client.request('GET', '/api/career-profile');
  assert.equal(bobProfile.data.professional_summary, undefined); assert.equal(Object.hasOwn(bobProfile.data, 'password_hash'), false);
  assert.equal(get('SELECT COUNT(*) n FROM career_profiles WHERE user_id=?', alice.user.id).n, 1);
  assert.equal(get('SELECT COUNT(*) n FROM career_profiles WHERE user_id=?', bob.user.id).n, 0);
  const suggestion = await alice.client.request('POST', '/api/career-profile/summary-suggestion', {});
  assert.equal(suggestion.data.mechanism, 'rule_based_template'); assert.match(suggestion.data.suggestion, /Science Teacher/); assert.match(suggestion.data.suggestion, /5 years/);
  const overview = await alice.client.request('GET', '/api/career');
  assert.equal(overview.data.hasCv, true); assert.equal(overview.data.applications, 0); assert.equal(overview.data.profileCompletion > 80, true);

  const created = run(`INSERT INTO jobs (title,school,city,job_type,subject,description,apply_email) VALUES (?,?,?,?,?,?,?)`, 'Science Faculty', 'Career School', 'Pune', 'Full-time', 'Science', 'Teach middle-school science through inquiry and practical classroom learning.', 'jobs@career.test');
  const jobId = Number(created.lastInsertRowid);
  const filtered = await alice.client.request('GET', '/api/jobs?q=faculty&subject=Science&city=Pune&type=Full-time');
  assert.equal(filtered.status, 200); assert.equal(filtered.data.some(job => job.id === jobId), true);
  const detail = await alice.client.request('GET', `/api/jobs/${jobId}`);
  assert.equal(detail.data.applied, 0); assert.equal(detail.data.title, 'Science Faculty');
  assert.equal((await bob.client.request('POST', '/api/admin/jobs', { title: 'Unauthorized job' })).status, 403);
  const application = await alice.client.request('POST', `/api/jobs/${jobId}/apply`, {});
  assert.equal(application.status, 200); assert.equal(application.data.status, 'applied');
  assert.equal((await alice.client.request('POST', `/api/jobs/${jobId}/apply`, {})).status, 409);
  assert.equal(get('SELECT COUNT(*) n FROM job_applications WHERE user_id=? AND job_id=?', alice.user.id, jobId).n, 1);
  const mine = await alice.client.request('GET', '/api/applications');
  assert.equal(mine.data.length, 1); assert.equal(mine.data[0].job_id, jobId); assert.equal(mine.data[0].status, 'applied');
  assert.equal((await bob.client.request('GET', '/api/applications')).data.length, 0);
  const appliedFilter = await alice.client.request('GET', '/api/jobs?applied=1');
  assert.equal(appliedFilter.data.length, 1); assert.equal(appliedFilter.data[0].application_status, 'applied');
  run("UPDATE jobs SET status='closed' WHERE id=?", jobId);
  assert.equal((await bob.client.request('POST', `/api/jobs/${jobId}/apply`, {})).status, 409);
});

test('community discussions and replies enforce ownership, moderation and retry safety', async () => {
  const alice = authenticatedUser('community-alice');
  const bob = authenticatedUser('community-bob');
  const { client: admin } = await getAdmin();
  const community = get('SELECT id,name FROM communities ORDER BY id LIMIT 1');
  const postBody = { title: 'Practical formative assessment ideas', body: 'What quick formative assessment routines work well in large middle-school classrooms?' };
  const created = await alice.client.request('POST', `/api/communities/${community.id}/posts`, postBody);
  assert.equal(created.status, 200); assert.equal(created.data.duplicate, undefined);
  const duplicatePost = await alice.client.request('POST', `/api/communities/${community.id}/posts`, postBody);
  assert.equal(duplicatePost.status, 200); assert.equal(duplicatePost.data.duplicate, true); assert.equal(duplicatePost.data.id, created.data.id);
  assert.equal(get('SELECT COUNT(*) n FROM posts WHERE id=?', created.data.id).n, 1);

  const search = await alice.client.request('GET', `/api/discussions?q=formative&community=${community.id}&mine=1&sort=recent`);
  assert.equal(search.status, 200); assert.equal(search.data.length, 1); assert.equal(search.data[0].author, get('SELECT name FROM users WHERE id=?', alice.user.id).name); assert.equal(search.data[0].replies, 0);
  const detail = await bob.client.request('GET', `/api/posts/${created.data.id}`);
  assert.equal(detail.status, 200); assert.equal(detail.data.post.title, postBody.title); assert.deepEqual(detail.data.replies, []);
  const malicious = '<script>alert(1)</script> Helpful text';
  const firstReply = await bob.client.request('POST', `/api/posts/${created.data.id}/replies`, { body: malicious });
  assert.equal(firstReply.status, 200);
  const duplicateReply = await bob.client.request('POST', `/api/posts/${created.data.id}/replies`, { body: malicious });
  assert.equal(duplicateReply.data.duplicate, true); assert.equal(duplicateReply.data.id, firstReply.data.id);
  const secondReply = await bob.client.request('POST', `/api/posts/${created.data.id}/replies`, { body: 'Exit tickets with one question work well for me.' });
  const afterReplies = await alice.client.request('GET', `/api/posts/${created.data.id}`);
  assert.deepEqual(afterReplies.data.replies.map(reply => reply.body), [malicious, 'Exit tickets with one question work well for me.']);
  const notifications = await alice.client.request('GET', '/api/notifications');
  assert.equal(notifications.data.items.filter(item => item.link === `#/post/${created.data.id}`).length, 2);
  assert.equal((await bob.client.request('GET', '/api/notifications')).data.items.some(item => item.link === `#/post/${created.data.id}`), false);

  assert.equal((await alice.client.request('DELETE', `/api/replies/${firstReply.data.id}`, {})).status, 403);
  assert.equal((await bob.client.request('DELETE', `/api/replies/${firstReply.data.id}`, {})).status, 200);
  assert.equal(get('SELECT COUNT(*) n FROM replies WHERE id=?', firstReply.data.id).n, 0);
  assert.equal((await bob.client.request('DELETE', `/api/posts/${created.data.id}`, {})).status, 403);
  assert.equal((await admin.request('DELETE', `/api/replies/${secondReply.data.id}`, {})).status, 200);
  assert.equal(get("SELECT COUNT(*) n FROM audit_log WHERE action='reply.delete' AND detail LIKE ?", `#${secondReply.data.id}%`).n, 1);

  const moderationPost = await alice.client.request('POST', `/api/communities/${community.id}/posts`, { title: 'Discussion requiring moderation', body: 'This discussion is created to verify secure administrator moderation.' });
  run('INSERT INTO replies (post_id,user_id,body) VALUES (?,?,?)', moderationPost.data.id, bob.user.id, 'Reply removed with its parent discussion.');
  assert.equal((await admin.request('DELETE', `/api/posts/${moderationPost.data.id}`, {})).status, 200);
  assert.equal(get('SELECT COUNT(*) n FROM replies WHERE post_id=?', moderationPost.data.id).n, 0);
  assert.equal(get("SELECT COUNT(*) n FROM audit_log WHERE action='post.delete' AND detail=?", `#${moderationPost.data.id}`).n, 1);
});

test('concurrent enrollment, application and completion remain duplicate-safe', async () => {
  const teacher = authenticatedUser('concurrent-business');
  const courseId = Number(run(`INSERT INTO courses (title,category,level,summary,instructor,cpd_hours)
    VALUES (?,?,?,?,?,?)`, 'Concurrent completion course', 'Testing', 'Beginner', 'Course used to verify concurrent completion safety.', 'Test Instructor', 2).lastInsertRowid);
  const lessonId = Number(run('INSERT INTO lessons (course_id,position,title,body,minutes) VALUES (?,?,?,?,?)', courseId, 1, 'Only lesson', 'Complete this single lesson safely.', 5).lastInsertRowid);
  const enrollments = await Promise.all(Array.from({ length: 8 }, () => teacher.client.request('POST', `/api/courses/${courseId}/enroll`, {})));
  assert.equal(enrollments.every((response) => response.status === 200), true);
  assert.equal(get('SELECT COUNT(*) n FROM enrollments WHERE user_id=? AND course_id=?', teacher.user.id, courseId).n, 1);

  const completions = await Promise.all(Array.from({ length: 6 }, () => teacher.client.request('POST', `/api/lessons/${lessonId}/complete`, {})));
  assert.equal(completions.every((response) => response.status === 200), true);
  assert.equal(completions.filter((response) => response.data.certificate).length, 1);
  const enrollment = get('SELECT completed_at,certificate_code FROM enrollments WHERE user_id=? AND course_id=?', teacher.user.id, courseId);
  assert.ok(enrollment.completed_at); assert.match(enrollment.certificate_code, /^TIN-/);
  assert.equal(get("SELECT COUNT(*) n FROM audit_log WHERE user_id=? AND action='course.complete'", teacher.user.id).n, 1);

  const jobId = Number(run(`INSERT INTO jobs (title,school,city,description,apply_email) VALUES (?,?,?,?,?)`,
    'Concurrent application role', 'Test School', 'Chennai', 'Role used for duplicate-safe concurrency testing.', 'jobs@test.local').lastInsertRowid);
  const applications = await Promise.all(Array.from({ length: 8 }, () => teacher.client.request('POST', `/api/jobs/${jobId}/apply`, {})));
  assert.equal(applications.filter((response) => response.status === 200).length, 1);
  assert.equal(applications.filter((response) => response.status === 409).length, 7);
  assert.equal(get('SELECT COUNT(*) n FROM job_applications WHERE user_id=? AND job_id=?', teacher.user.id, jobId).n, 1);
});

test('concurrent reverse connection requests converge to one accepted relationship', async () => {
  const alice = authenticatedUser('concurrent-alice'); const bob = authenticatedUser('concurrent-bob');
  const [fromAlice, fromBob] = await Promise.all([
    alice.client.request('POST', '/api/connections', { user_id: bob.user.id }),
    bob.client.request('POST', '/api/connections', { user_id: alice.user.id }),
  ]);
  assert.equal(fromAlice.status, 200); assert.equal(fromBob.status, 200);
  const rows = db.prepare(`SELECT * FROM connections WHERE (requester_id=? AND addressee_id=?) OR (requester_id=? AND addressee_id=?)`).all(alice.user.id, bob.user.id, bob.user.id, alice.user.id);
  assert.equal(rows.length, 1); assert.equal(rows[0].status, 'accepted');
});

test('concurrent workshop registration remains duplicate-safe', async () => {
  const { client, user } = authenticatedUser('workshop-concurrent');
  const workshop = get("SELECT id FROM workshops WHERE starts_at>datetime('now') ORDER BY starts_at LIMIT 1");
  assert.ok(workshop);
  const responses = await Promise.all(Array.from({ length: 8 }, () => client.request('POST', `/api/workshops/${workshop.id}/register`, {})));
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(get('SELECT COUNT(*) n FROM workshop_regs WHERE user_id=? AND workshop_id=?', user.id, workshop.id).n, 1);
});

test('attendance verification racing cancellation leaves a valid registration state', async () => {
  const admin = await getAdmin(); const teacher = authenticatedUser('attendance-race');
  const workshop = run(`INSERT INTO workshops (title,description,facilitator,category,mode,location,starts_at,duration_min,capacity,cpd_hours,created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,'Race workshop','Completed workshop for concurrency verification','Facilitator','CPD','Online','Online','2020-01-01T00:00:00.000Z',60,20,2,admin.user.id);
  const wid=Number(workshop.lastInsertRowid); run('INSERT INTO workshop_regs (user_id,workshop_id) VALUES (?,?)',teacher.user.id,wid);
  const [attendance,cancel]=await Promise.all([
    admin.client.request('POST',`/api/admin/workshops/${wid}/registrations/${teacher.user.id}/attendance`,{status:'attended'}),
    teacher.client.request('POST',`/api/workshops/${wid}/cancel`,{}),
  ]);
  assert.ok([200,404].includes(attendance.status)); assert.equal(cancel.status,200);
  const registration=get('SELECT * FROM workshop_regs WHERE user_id=? AND workshop_id=?',teacher.user.id,wid);
  assert.equal(registration,undefined);
  assert.ok(get("SELECT COUNT(*) n FROM audit_log WHERE action='admin.workshop_attendance' AND detail LIKE ?",`workshop=${wid}%`).n<=1);
});

test('simultaneous support replies persist completely with valid ordering', async () => {
  const teacher=authenticatedUser('ticket-race'); const ticket=run('INSERT INTO tickets (user_id,category,subject,body) VALUES (?,?,?,?)',teacher.user.id,'Technical Issue','Concurrent replies','Testing simultaneous ticket replies.'); const tid=Number(ticket.lastInsertRowid);
  const responses=await Promise.all(Array.from({length:4},(_,i)=>teacher.client.request('POST',`/api/tickets/${tid}/replies`,{body:`Concurrent reply ${i}`})));
  assert.ok(responses.every(r=>r.status===200));
  const replies=db.prepare('SELECT id,body FROM ticket_replies WHERE ticket_id=? ORDER BY id').all(tid); assert.equal(replies.length,4); assert.equal(new Set(replies.map(r=>r.id)).size,4);
  assert.equal(get('SELECT status FROM tickets WHERE id=?',tid).status,'open');
});

test('conflicting mentorship transitions yield one valid final state', async () => {
  const mentor=authenticatedUser('mentor-race'); run('UPDATE users SET open_to_mentor=1,role=? WHERE id=?','mentor',mentor.user.id); const mentee=authenticatedUser('mentee-race');
  const created=run('INSERT INTO mentorships (mentee_id,mentor_id,topic,message) VALUES (?,?,?,?)',mentee.user.id,mentor.user.id,'Assessment','Please help with assessment practice.'); const mid=Number(created.lastInsertRowid);
  const responses=await Promise.all(['accept','decline'].map(action=>mentor.client.request('POST',`/api/mentorships/${mid}/respond`,{action})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const status=get('SELECT status FROM mentorships WHERE id=?',mid).status; assert.ok(['active','declined'].includes(status));
  const canMessage=get("SELECT 1 ok FROM mentorships WHERE id=? AND status='active'",mid); assert.equal(!!canMessage,status==='active');
});

test('concurrent identical community replies preserve duplicate suppression', async () => {
  const author=authenticatedUser('post-author'); const replier=authenticatedUser('post-replier'); const community=get('SELECT id FROM communities ORDER BY id LIMIT 1');
  const post=run('INSERT INTO posts (community_id,user_id,title,body) VALUES (?,?,?,?)',community.id,author.user.id,'Concurrency discussion','A discussion created for concurrent reply testing.'); const pid=Number(post.lastInsertRowid);
  const responses=await Promise.all(Array.from({length:4},()=>replier.client.request('POST',`/api/posts/${pid}/replies`,{body:'One identical concurrent response'})));
  assert.ok(responses.every(r=>r.status===200)); assert.equal(get('SELECT COUNT(*) n FROM replies WHERE post_id=? AND user_id=? AND body=?',pid,replier.user.id,'One identical concurrent response').n,1);
  assert.equal(get('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND link=?',author.user.id,`#/post/${pid}`).n,1);
});

test('failed account deletion rolls back the user and active session', async () => {
  const {client,user,password}=authenticatedUser('delete-rollback');
  run(`CREATE TEMP TRIGGER fail_account_delete_audit BEFORE INSERT ON audit_log
    WHEN NEW.action='privacy.account_deleted' BEGIN SELECT RAISE(ABORT,'forced account deletion audit failure'); END`);
  try {
    const response=await client.request('POST','/api/profile/delete',{password}); assert.equal(response.status,409);
    assert.ok(get('SELECT id FROM users WHERE id=?',user.id));
    assert.equal(get('SELECT COUNT(*) n FROM sessions WHERE user_id=?',user.id).n,1);
  } finally { run('DROP TRIGGER fail_account_delete_audit'); }
});

test('simultaneous lesson-plan updates preserve last-write-wins ownership', async () => {
  const teacher=authenticatedUser('plan-update-race');const base={title:'Concurrent plan',subject:'Math',grade:'6',plan_date:'2099-05-01',duration_min:40,objectives:'Understand fractions',materials:'Cards',activities:'Group activity',assessment:'Exit ticket',reflection:''};
  const created=await teacher.client.request('POST','/api/plans',base);assert.equal(created.status,200);
  const responses=await Promise.all(['Version Alpha','Version Beta'].map(title=>teacher.client.request('PUT',`/api/plans/${created.data.id}`,{...base,title})));
  assert.ok(responses.every(r=>r.status===200));const final=get('SELECT title FROM lesson_plans WHERE id=? AND user_id=?',created.data.id,teacher.user.id);assert.ok(['Version Alpha','Version Beta'].includes(final.title));
});

test('lesson-plan update racing deletion leaves a valid absent final state', async () => {
  const teacher=authenticatedUser('plan-delete-race');const base={title:'Delete race plan',subject:'Science',grade:'7',plan_date:'2099-06-01',duration_min:40,objectives:'Observe changes',materials:'Notes',activities:'Discussion',assessment:'Question',reflection:''};
  const created=await teacher.client.request('POST','/api/plans',base);const responses=await Promise.all([teacher.client.request('PUT',`/api/plans/${created.data.id}`,{...base,title:'Updated during race'}),teacher.client.request('DELETE',`/api/plans/${created.data.id}`,{})]);
  assert.equal(responses[1].status,200);assert.ok([200,404].includes(responses[0].status));assert.equal(get('SELECT id FROM lesson_plans WHERE id=?',created.data.id),undefined);assert.equal((await teacher.client.request('DELETE',`/api/plans/${created.data.id}`,{})).status,404);
});

test('concurrent tutorial saves preserve one row and toggle semantics', async () => {
  const teacher=authenticatedUser('tutorial-race');const tutorial=get('SELECT id FROM tutorials ORDER BY id LIMIT 1');const responses=await Promise.all(Array.from({length:4},()=>teacher.client.request('POST',`/api/tutorials/${tutorial.id}/save`,{})));
  assert.ok(responses.every(r=>r.status===200));const rows=get('SELECT COUNT(*) n,MAX(saved) saved FROM tutorial_views WHERE user_id=? AND tutorial_id=?',teacher.user.id,tutorial.id);assert.equal(rows.n,1);assert.equal(rows.saved,0);
});

test('notification-linked writes roll back atomically when notification persistence fails', async () => {
  const alice = authenticatedUser('atomic-alice'); const bob = authenticatedUser('atomic-bob');
  run("INSERT INTO connections (requester_id,addressee_id,status) VALUES (?,?, 'accepted')", alice.user.id, bob.user.id);
  const before = get('SELECT COUNT(*) n FROM messages WHERE sender_id=? AND recipient_id=?', alice.user.id, bob.user.id).n;
  db.exec("CREATE TRIGGER phase16_fail_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'phase16 notification failure'); END");
  try {
    const response = await alice.client.request('POST', `/api/messages/${bob.user.id}`, { body: 'This message must roll back with its notification.' });
    assert.equal(response.status, 409);
    assert.equal(response.data.error, 'The requested change conflicts with an existing or related record.');
    assert.equal(get('SELECT COUNT(*) n FROM messages WHERE sender_id=? AND recipient_id=?', alice.user.id, bob.user.id).n, before);
  } finally { db.exec('DROP TRIGGER phase16_fail_notification'); }
});

test('SQLite write-lock contention returns a bounded safe 503 without persisting', async () => {
  const teacher = authenticatedUser('busy-writer');
  const locker = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA busy_timeout=50'); locker.exec('PRAGMA busy_timeout=50; BEGIN IMMEDIATE');
  try {
    const response = await teacher.client.request('POST', '/api/plans', {
      title: 'Locked write plan', subject: 'Science', grade: '6', plan_date: '', duration_min: 40,
      objectives: 'This write should not persist.', materials: '', activities: '', assessment: '', reflection: '',
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('retry-after'), '1');
    assert.equal(response.data.error, 'The service is temporarily busy. Please retry shortly.');
    assert.equal(get("SELECT COUNT(*) n FROM lesson_plans WHERE user_id=? AND title='Locked write plan'", teacher.user.id).n, 0);
  } finally {
    locker.exec('ROLLBACK'); locker.close(); db.exec('PRAGMA busy_timeout=5000');
  }
});
