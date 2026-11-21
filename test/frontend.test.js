'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadClient() {
  const file = path.join(__dirname, '..', 'frontend', 'app.js');
  const source = fs.readFileSync(file, 'utf8');
  const boot = source.indexOf('  // ====================================================================== boot');
  assert.notEqual(boot, -1, 'client boot marker must exist');
  const toast = { textContent: '', className: '' };
  const root = { dataset: {} };
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
  };
  const sandbox = {
    URLSearchParams,
    console,
    confirm: () => true,
    setTimeout: () => 1,
    clearTimeout: () => {},
    localStorage,
    location: { hash: '#/', host: 'localhost' },
    window: { addEventListener() {}, scrollTo() {}, print() {} },
    document: {
      documentElement: root,
      addEventListener() {},
      querySelector: (selector) => selector === '#toast' ? toast : null,
      querySelectorAll: () => [],
    },
  };
  vm.createContext(sandbox);
  const hooks = `
    globalThis.__appTest = {
      landing, layout, routes, actions, forms, html, applyDyn, openModal, closeModal, refreshBadges,
      normalizeTheme, storedTheme, applyTheme, storedColorMode, applyColorMode,
      storedSidebarCollapsed, sidebarCollapsed, applySidebarState,
      setMe(user) { state.me = user; },
      setApi(fn) { api = fn; },
      setRender(fn) { render = fn; },
      invokeApi(...args) { return api(...args); },
      setCsrf(value) { state.csrf = value; },
      getState() { return state; },
      setBadges(value) { state.cache.badges = value; }
    };
  })();`;
  vm.runInContext(source.slice(0, boot) + hooks, sandbox, { filename: file });
  return { sandbox, hooks: sandbox.__appTest, storage, root };
}

test('registration and login tabs generate normalized routes and forms', async () => {
  const { hooks } = loadClient();
  const loginLanding = hooks.landing('login').s;
  const registerHref = loginLanding.match(/href="([^"]+)"[^>]*>Create account<\/a>/)?.[1];
  const registerLanding = hooks.landing('register').s;
  const loginHref = registerLanding.match(/href="([^"]+)"[^>]*>Sign in<\/a>/)?.[1];

  assert.equal(registerHref, '#/register');
  assert.equal(loginHref, '#/');
  assert.equal(loginLanding.includes('#//'), false);
  assert.match(loginLanding, /data-form="login"/);
  const registerRoute = hooks.routes.find((route) => route.re.test('/register'));
  assert.ok(registerRoute);
  const directRegistration = await registerRoute.fn('/register'.match(registerRoute.re), new URLSearchParams());
  assert.match(directRegistration.s, /data-form="register"/);
});

test('lesson planner overview combines real statistics, search and professional plan actions', async () => {
  const { hooks } = loadClient();
  hooks.setApi(async (method, url) => {
    if (url === '/api/plans/overview') return { total: 4, upcoming: 2, thisWeek: 1, undated: 1 };
    if (url.startsWith('/api/plans?')) return [{ id: 8, title: '<Geometry>', subject: 'Math', grade: '6', plan_date: '2099-05-10', duration_min: 40, objectives: '<script>bad()</script>', updated_at: '2099-05-01' }];
    throw new Error(url);
  });
  const route = hooks.routes.find(r => r.re.test('/planner') && !r.re.test('/planner/new'));
  const page = (await route.fn('/planner'.match(route.re), new URLSearchParams('q=geo&scope=upcoming'))).s;
  assert.match(page, /Lesson planning workspace/);
  assert.match(page, /Saved plans[\s\S]*4/);
  assert.match(page, /data-form="plan-search"/);
  assert.match(page, /View plan/);
  assert.match(page, /Duplicate/);
  assert.equal(page.includes('<Geometry>'), false);
  assert.equal(page.includes('<script>'), false);
});

test('lesson builder templates, detail view and calendar expose working supported workflows', async () => {
  const { hooks } = loadClient();
  const plan = { id: 9, title: 'Water cycle', subject: 'Science', grade: '5', plan_date: '2099-06-15', duration_min: 50, objectives: 'Explain evaporation', activities: 'Observe and discuss', assessment: 'Exit ticket', materials: 'Diagram', reflection: '', updated_at: '2099-06-01' };
  hooks.setApi(async (method, url) => url === '/api/plans' ? [plan] : url === '/api/plans/9' ? plan : (() => { throw new Error(url); })());
  const newRoute = hooks.routes.find(r => r.re.test('/planner/new'));
  const builder = (await newRoute.fn('/planner/new'.match(newRoute.re), new URLSearchParams('template=assessment&date=2099-06-15'))).s;
  assert.match(builder, /Assessment-focused lesson selected/);
  assert.match(builder, /Checks for understanding/);
  assert.match(builder, /value="2099-06-15"/);
  const detailRoute = hooks.routes.find(r => r.re.test('/planner/9') && !r.re.test('/planner/9/edit'));
  const detail = (await detailRoute.fn('/planner/9'.match(detailRoute.re), new URLSearchParams())).s;
  assert.match(detail, /Print \/ Save as PDF/);
  assert.match(detail, /Learning objectives/);
  const calendarRoute = hooks.routes.find(r => r.re.test('/planner/calendar'));
  const calendar = (await calendarRoute.fn('/planner/calendar'.match(calendarRoute.re), new URLSearchParams('month=2099-06&day=2099-06-15'))).s;
  assert.match(calendar, /Previous month/);
  assert.match(calendar, /Next month/);
  assert.match(calendar, /2099-06-15, 1 lesson/);
  assert.match(calendar, /Water cycle/);
});

test('lesson planning styles are responsive, theme-token driven and A4 print safe', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /\.planner-hero/);
  assert.match(css, /var\(--primary-soft\)/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /@page\{size:A4/);
  assert.match(css, /\.print-plan/);
  assert.match(css, /\.plan-detail-actions/);
});

test('notification bell renders an accessible capped unread badge and keyboard-ready dropdown', () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 1, name: 'Teacher One', role: 'user', designation: 'Teacher' }); hooks.setBadges({ notifications: 14 });
  const page = hooks.layout('dashboard', { s: '<p>Dashboard</p>' }).s;
  assert.match(page, /aria-label="Notifications, 14 unread notifications"/);
  assert.match(page, />9\+<\/span>/);
  assert.match(page, /aria-haspopup="true"/);
  assert.match(page, /aria-expanded="false"/);
  assert.match(page, /id="notification-popover"/);
  assert.match(page, /Mark all read/);
  assert.match(page, /View all notifications/);
});

test('notification center renders category and read filters, history groups and safe escaped content', async () => {
  const { hooks } = loadClient();
  hooks.setApi(async (method, url) => ({ items: [{ id: 7, text: '<script>unsafe</script>', link: '#/post/5', read_at: null, created_at: new Date().toISOString(), category: 'community' }], total: 1, unread: 1, page: 1, pages: 1, counts: { community: 1 } }));
  const route = hooks.routes.find(r => r.re.test('/notifications'));
  const page = (await route.fn('/notifications'.match(route.re), new URLSearchParams('state=unread&category=community'))).s;
  assert.match(page, /Notifications &amp; Activity/);
  assert.match(page, /Unread notifications/);
  assert.match(page, /Notification category/);
  assert.match(page, /Community \(1\)/);
  assert.match(page, /Today/);
  assert.match(page, /Unread notification/);
  assert.match(page, /data-action="open-notification"/);
  assert.equal(page.includes('<script>unsafe</script>'), false);
});

test('notification activity center remains responsive, theme-token driven and accessible', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  assert.match(css, /\.notification-popover/); assert.match(css, /var\(--primary-soft\)/);
  assert.match(css, /@media\(max-width:700px\)/); assert.match(css, /@media\(max-width:390px\)/);
  assert.match(source, /e\.key === 'Escape'/); assert.match(source, /aria-haspopup="true"/);
  assert.equal(source.includes("/^#\\/[a-z0-9/?=&._-]*$/i"), true);
});

test('administrator dashboard renders real metrics, grouped navigation and working quick actions', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 1, name: 'Platform Admin', role: 'admin', designation: 'Administrator' });
  hooks.setApi(async (method,url) => { if(url==='/api/admin/overview') return { teachers:12,courses:4,enrollments:28,workshops:3,workshopRegs:9,jobs:2,applications:5,posts:7,tickets:6,newUsers30:2,completions:10,openTickets:1,activeSessions:3,failedLogins24h:0,signups:[],popularCourses:[] }; throw new Error(url); });
  const route=hooks.routes.find(r=>r.re.test('/admin')&&!r.re.test('/admin/users/4'));
  const page=(await route.fn('/admin'.match(route.re),new URLSearchParams())).s;
  assert.match(page,/Administrator Dashboard/); assert.match(page,/12[\s\S]*Registered teachers/);
  for(const link of ['#/admin/users','#/admin/courses','#/admin/workshops','#/admin/attendance','#/admin/jobs','#/admin/community','#/admin/tickets','#/admin/audit']) assert.ok(page.includes(`href="${link}"`));
  assert.match(page,/aria-label="Administrator sections"/);
});

test('administrator analytics and management pages use supported records and preserve privacy', async () => {
  const { hooks }=loadClient(); hooks.setMe({id:1,name:'Admin',role:'admin'});
  hooks.setApi(async(method,url)=>{ if(url.startsWith('/api/admin/analytics')) return {enrollments:4,completions:2,certificates:1,workshopRegistrations:3,attended:2,discussions:5,replies:8,jobs:1,applications:2,connections:6,acceptedConnections:4}; if(url==='/api/admin/mentorships') return [{id:1,topic:'Science mentoring',status:'active',created_at:'2026-11-01',mentee:'Asha',mentor:'Dev'}]; throw new Error(url); });
  const route=hooks.routes.find(r=>r.re.test('/admin/analytics'));
  const analytics=(await route.fn('/admin/analytics'.match(route.re),new URLSearchParams('period=7'))).s;
  assert.match(analytics,/Platform analytics/); assert.match(analytics,/Last 7 days/); assert.match(analytics,/Certificates issued/);
  const mentorship=(await route.fn('/admin/mentorship'.match(route.re),new URLSearchParams())).s;
  assert.match(mentorship,/private mentorship messages are not exposed/); assert.match(mentorship,/Science mentoring/);
});

test('Sky Blue initializes before CSS while saved Classic and Sky preferences remain supported', () => {
  const index=fs.readFileSync(path.join(__dirname,'..','frontend','index.html'),'utf8'); const init=fs.readFileSync(path.join(__dirname,'..','frontend','theme-init.js'),'utf8');
  assert.match(index,/<html lang="en-IN" data-theme="sky">/); assert.match(index,/<meta name="theme-color" content="#2563eb">/);
  assert.ok(index.indexOf('/theme-init.js') < index.indexOf('/styles.css'));
  assert.match(init,/let theme = 'sky'/); assert.match(init,/saved === 'classic' \|\| saved === 'sky'/);
  const {hooks,root,storage}=loadClient(); assert.equal(root.dataset.theme,'sky'); hooks.applyTheme('classic'); assert.equal(storage.get('teachersinn-theme'),'classic'); assert.equal(hooks.storedTheme(),'classic'); hooks.applyTheme('sky'); assert.equal(hooks.storedTheme(),'sky');
});

test('administrator workspace is responsive, theme-compatible and sidebar-safe', () => {
  const css=fs.readFileSync(path.join(__dirname,'..','frontend','styles.css'),'utf8');
  assert.match(css,/\.admin-nav/); assert.match(css,/\.admin-metrics/); assert.match(css,/\.admin-profile-layout/);
  assert.match(css,/@media\(max-width:760px\)/); assert.match(css,/@media\(max-width:390px\)/);
  assert.match(css,/var\(--board-soft\)|var\(--primary-soft\)/); assert.match(css,/--primary: var\(--board\)/);
});

test('settings workspace centralizes account, professional, privacy and data controls', async () => {
  const {hooks}=loadClient(); const user={id:3,name:'Asha Teacher',email:'asha@test.local',role:'educator',status:'active',designation:'Teacher',school:'Learning School',subjects:'Science',grades:'6-8',board:'CBSE',city:'Pune',state:'Maharashtra',bio:'Science educator',experience_years:5,open_to_mentor:1,directory_visible:1,created_at:'2026-01-01',last_login_at:'2026-11-14',consent_at:'2026-01-01',consent_version:'1'}; hooks.setMe(user);
  hooks.setApi(async(method,url)=>{if(url==='/api/me')return{user,csrf:'token'};if(url==='/api/settings')return{account:user,profileCompletion:100,hasCareerProfile:true,notifications:{messages:1,connections:1,community:1,workshops:1,learning:1,mentorship:1,support:1}};throw new Error(url);});
  const route=hooks.routes.find(r=>r.re.test('/settings'));
  const overview=(await route.fn('/settings'.match(route.re),new URLSearchParams())).s;
  assert.match(overview,/Settings &amp; Preferences/); assert.match(overview,/Account overview/); assert.match(overview,/100%/);
  for(const section of ['personal','professional','security','privacy','notifications','appearance','data'])assert.ok(overview.includes(`#/settings/${section}`));
  const professional=(await route.fn('/settings/professional'.match(route.re),new URLSearchParams())).s;
  assert.match(professional,/Private Career Hub CV drafts remain separate/); assert.match(professional,/data-form="settings-professional"/);
  const privacy=(await route.fn('/settings/privacy'.match(route.re),new URLSearchParams())).s;
  assert.match(privacy,/Educator directory visibility/); assert.match(privacy,/private CV drafts/);
  const data=(await route.fn('/settings/data'.match(route.re),new URLSearchParams())).s;
  assert.match(data,/Download my data/); assert.match(data,/data-form="delete-account"/);
});

test('settings notification controls are real categories and appearance stays synchronized', async () => {
  const {hooks,root,storage}=loadClient(); const user={id:4,name:'Admin User',email:'admin@test.local',role:'admin',status:'active',created_at:'2026-01-01',directory_visible:1}; hooks.setMe(user);
  hooks.setApi(async(method,url)=>url==='/api/me'?{user,csrf:'x'}:url==='/api/settings'?{account:user,profileCompletion:20,hasCareerProfile:false,notifications:{messages:1,connections:0,community:1,workshops:1,learning:1,mentorship:0,support:1}}:(()=>{throw new Error(url)})());
  const route=hooks.routes.find(r=>r.re.test('/settings/notifications'));
  const notifications=(await route.fn('/settings/notifications'.match(route.re),new URLSearchParams())).s;
  assert.match(notifications,/data-form="settings-notifications"/); assert.match(notifications,/Essential system and account notices cannot be disabled/); assert.match(notifications,/name="connections"/);
  const appearance=(await route.fn('/settings/appearance'.match(route.re),new URLSearchParams())).s;
  assert.match(appearance,/Sky Blue/); assert.match(appearance,/Classic Golden/); assert.match(appearance,/Follow device setting/);
  assert.equal(root.dataset.theme,'sky'); hooks.applyTheme('classic'); assert.equal(storage.get('teachersinn-theme'),'classic');
  assert.equal(hooks.applyColorMode('dark'),'dark'); assert.equal(root.dataset.mode,'dark'); assert.equal(storage.get('teachersinn-color-mode'),'dark'); assert.equal(hooks.applyColorMode('invalid'),'system');
});

test('settings password confirmation blocks mismatches before the API request', async () => {
  const {hooks}=loadClient(); let calls=0; hooks.setApi(async()=>{calls+=1;return{ok:true};});
  await assert.rejects(()=>hooks.forms.password({current:'old',next:'NewPassword2026',confirm:'DifferentPassword2026'},{reset(){}}),/do not match/); assert.equal(calls,0);
});

test('settings workspace is responsive, accessible and theme-token driven', () => {
  const css=fs.readFileSync(path.join(__dirname,'..','frontend','styles.css'),'utf8'); const source=fs.readFileSync(path.join(__dirname,'..','frontend','app.js'),'utf8');
  assert.match(css,/\.settings-layout/); assert.match(css,/\.settings-nav/); assert.match(css,/\.settings-toggle/); assert.match(css,/@media\(max-width:850px\)/); assert.match(css,/@media\(max-width:480px\)/);
  assert.match(css,/:root\[data-mode="dark"\]/); assert.match(css,/:root\[data-theme="sky"\]\[data-mode="light"\]/); assert.match(source,/aria-label="Settings sections"/); assert.match(source,/role="alert"/);
});

test('enrolling while already on the course rerenders after success', async () => {
  const { sandbox, hooks } = loadClient();
  sandbox.location.hash = '#/course/7';
  let renders = 0;
  hooks.setApi(async (method, url) => {
    assert.equal(method, 'POST');
    assert.equal(url, '/api/courses/7/enroll');
    return { ok: true };
  });
  hooks.setRender(async () => { renders += 1; });

  await hooks.actions.enroll({ dataset: { id: '7' } });

  assert.equal(sandbox.location.hash, '#/course/7');
  assert.equal(renders, 1);
});

test('failed enrollment leaves the current course state unchanged', async () => {
  const { sandbox, hooks } = loadClient();
  sandbox.location.hash = '#/course/7';
  let renders = 0;
  hooks.setApi(async () => { throw new Error('Enrollment failed'); });
  hooks.setRender(async () => { renders += 1; });

  await assert.rejects(() => hooks.actions.enroll({ dataset: { id: '7' } }), /Enrollment failed/);
  assert.equal(sandbox.location.hash, '#/course/7');
  assert.equal(renders, 0);
});

test('theme selector renders exactly Classic and Sky Blue options', () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Test Teacher', designation: 'Educator', role: 'educator' });
  const page = hooks.layout('dashboard', '').s;
  assert.match(page, /data-change="theme"/);
  assert.deepEqual([...page.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]), ['classic', 'sky']);
});

test('theme switches to Sky Blue and back to Classic with persistence', () => {
  const { hooks, storage, root } = loadClient();
  assert.equal(hooks.applyTheme('sky'), 'sky');
  assert.equal(root.dataset.theme, 'sky');
  assert.equal(storage.get('teachersinn-theme'), 'sky');
  assert.equal(hooks.storedTheme(), 'sky');
  assert.equal(hooks.applyTheme('classic'), 'classic');
  assert.equal(root.dataset.theme, 'classic');
  assert.equal(storage.get('teachersinn-theme'), 'classic');
});

test('new and invalid stored themes safely fall back to Sky Blue', () => {
  const { hooks, storage, root } = loadClient();
  storage.set('teachersinn-theme', 'neon');
  assert.equal(hooks.storedTheme(), 'sky');
  assert.equal(hooks.applyTheme('neon'), 'sky');
  assert.equal(root.dataset.theme, 'sky');
});

test('theme CSS keeps system dark appearance and mobile selector rules', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /@media \(prefers-color-scheme: dark\)[\s\S]*:root\[data-theme="sky"\]/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.theme-picker select/);
  assert.match(css, /:root\[data-theme="sky"\][\s\S]*--board: #2563eb/);
});

test('Classic theme keeps the warm TeachersInn gold and white visual system', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  const refresh = css.slice(css.indexOf('Professional workspace refresh'));
  const classic = refresh.slice(0, refresh.indexOf('Sky Blue is a colour theme'));
  assert.match(classic, /--paper: #ffffff/);
  assert.match(classic, /--side: #fbd36b/);
  assert.match(classic, /--board: #b45f06/);
  assert.match(classic, /--hero-a: #fde39f/);
  assert.match(classic, /--hero-b: #f8c063/);
  assert.match(classic, /--ink: #2b2416/);
  assert.doesNotMatch(classic, /--side: #142238/);
});

test('sidebar toggle renders with accessible expanded state and intact navigation links', () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Test Teacher', designation: 'Educator', role: 'educator' });
  const page = hooks.layout('dashboard', '').s;
  assert.match(page, /data-action="toggle-sidebar"/);
  assert.match(page, /aria-label="Collapse sidebar"/);
  assert.match(page, /aria-expanded="true"/);
  assert.match(page, /href="#\/dashboard"[^>]*aria-current="page"/);
  assert.match(page, /href="#\/dashboard"[^>]*aria-label="Dashboard"/);
  assert.match(page, /href="#\/messages"[^>]*aria-label="Messages"/);
});

test('sidebar state collapses, expands and persists safely', () => {
  const { hooks, storage, root } = loadClient();
  assert.equal(hooks.sidebarCollapsed(), false);
  assert.equal(hooks.applySidebarState(true), true);
  assert.equal(root.dataset.sidebar, 'collapsed');
  assert.equal(storage.get('teachersinn.sidebar.collapsed'), 'true');
  assert.equal(hooks.storedSidebarCollapsed(), true);
  assert.equal(hooks.applySidebarState(false), false);
  assert.equal(root.dataset.sidebar, 'expanded');
});

test('invalid sidebar preferences fall back to expanded', () => {
  const { hooks, storage } = loadClient();
  storage.set('teachersinn.sidebar.collapsed', 'sometimes');
  assert.equal(hooks.storedSidebarCollapsed(), false);
});

test('sidebar CSS expands content, preserves mobile drawer and reduced motion', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /--sidebar-expanded: 260px/);
  assert.match(css, /--sidebar-collapsed: 72px/);
  assert.match(css, /grid-template-columns: var\(--sidebar-width\) minmax\(0, 1fr\)/);
  assert.match(css, /#sidebar-tooltip \{ position: fixed/);
  assert.match(css, /data-sidebar="collapsed"[^}]*\.side-head \{[^}]*flex-direction: column/);
  assert.match(css, /data-sidebar="collapsed"[^}]*\.nav a \{[^}]*width: 44px[^}]*height: 44px/);
  assert.match(css, /\.nav \.sect:first-child \{[^}]*border-top: 0/);
  assert.match(css, /data-sidebar="collapsed"[^}]*\.nav \{[^}]*overflow-y: auto/);
  assert.match(css, /@media \(max-width: 860px\)[\s\S]*\.sidebar-toggle \{ display: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /data-theme="sky"[\s\S]*\.sidebar/);
});

function dashboardFixture(overrides = {}) {
  return {
    stats: { enrolled: 4, completed: 2, workshops: 1, connections: 8, pendingRequests: 0, unreadMessages: 3, openTickets: 0, plans: 0 },
    cpd: { courses: 4, workshops: 2, total: 6, goal: 50 },
    learning: [{ id: 7, title: 'Inclusive Classrooms', category: 'Pedagogy', total: 5, done: 2 }],
    activity: [{ label: '10-01', n: 0 }, { label: '10-08', n: 1 }],
    upcoming: [{ id: 3, title: 'Assessment Workshop', starts_at: '2030-12-01T10:00:00Z', mode: 'Online', registered: 1 }],
    discussions: [], todayPlans: [], notifications: [],
    ...overrides,
  };
}

test('dashboard renders real statistics, course progress, workshops and quick actions', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Asha Teacher', designation: 'Teacher', school: 'Model School', subjects: 'Science', grades: '6-8', board: 'CBSE', city: 'Pune', bio: '' });
  hooks.setApi(async (method, requestPath) => {
    assert.equal(method, 'GET');
    assert.equal(requestPath, '/api/dashboard');
    return dashboardFixture();
  });
  const route = hooks.routes.find((entry) => entry.re.test('/dashboard'));
  const page = (await route.fn()).s;
  assert.match(page, /Courses enrolled[\s\S]*Courses completed[\s\S]*Upcoming workshops[\s\S]*Connections[\s\S]*Unread messages/);
  assert.match(page, /Inclusive Classrooms[\s\S]*40% complete/);
  assert.match(page, /Assessment Workshop[\s\S]*Registered/);
  assert.match(page, /aria-label="Annual CPD goal progress"/);
  assert.match(page, /Profile completion[\s\S]*86%/);
  for (const href of ['#/learn', '#/workshops', '#/planner/new', '#/network']) assert.ok(page.includes(`href="${href}"`));
});

test('dashboard renders actionable empty states from zero-value data', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'New Teacher' });
  hooks.setApi(async () => dashboardFixture({
    stats: { enrolled: 0, completed: 0, workshops: 0, connections: 0, pendingRequests: 0, unreadMessages: 0, openTickets: 0, plans: 0 },
    cpd: { courses: 0, workshops: 0, total: 0, goal: 50 }, learning: [],
    activity: [{ label: '10-01', n: 0 }, { label: '10-08', n: 0 }], upcoming: [],
  }));
  const route = hooks.routes.find((entry) => entry.re.test('/dashboard'));
  const page = (await route.fn()).s;
  assert.match(page, /No courses in progress/);
  assert.match(page, /No recent lesson activity/);
  assert.match(page, /No upcoming workshops are currently available/);
  assert.match(page, /No connections yet/);
  assert.match(page, /0 of 7 professional details completed/);
});

test('dashboard layout responds to theme, sidebar and mobile breakpoints', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /\.dashboard-stats \{ grid-template-columns: repeat\(5/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.dashboard-grid/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.dashboard-secondary/);
  assert.match(css, /\.dashboard-stats \.stat-icon[^{]*\{[^}]*var\(--board-soft\)/);
  assert.match(css, /grid-template-columns: var\(--sidebar-width\)/);
});

function courseFixture(overrides = {}) {
  return {
    id: 7, title: 'Inclusive Classrooms', category: 'Pedagogy', level: 'Intermediate',
    summary: 'Practical strategies for inclusive teaching and accessible learning.', instructor: 'Dr Rao',
    cpd_hours: 4, lessons: 5, minutes: 80, learners: 12, enrolled_at: null, completed_at: null, done: 0,
    ...overrides,
  };
}

test('course catalogue supports search and real enrollment-status filters', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Course Teacher', role: 'educator' });
  const courses = [
    courseFixture(),
    courseFixture({ id: 8, title: 'Teacher Wellbeing', category: 'Wellbeing', summary: 'Sustainable routines for educators.', enrolled_at: '2026-01-01', done: 2 }),
    courseFixture({ id: 9, title: 'Assessment Practice', category: 'Assessment', enrolled_at: '2026-01-01', completed_at: '2026-02-01', done: 5 }),
  ];
  hooks.setApi(async (method, requestPath) => { assert.equal(`${method} ${requestPath}`, 'GET /api/courses'); return courses; });
  const route = hooks.routes.find((entry) => entry.re.test('/learn'));
  const searched = (await route.fn(null, new URLSearchParams('q=wellbeing'))).s;
  assert.match(searched, /Teacher Wellbeing/);
  assert.doesNotMatch(searched, /Inclusive Classrooms/);
  const inProgress = (await route.fn(null, new URLSearchParams('view=progress'))).s;
  assert.match(inProgress, /Teacher Wellbeing/);
  assert.doesNotMatch(inProgress, /Assessment Practice/);
  const completed = (await route.fn(null, new URLSearchParams('view=completed'))).s;
  assert.match(completed, /Assessment Practice[\s\S]*View certificate/);
  assert.doesNotMatch(completed, /Teacher Wellbeing/);
});

test('course catalogue renders searchable controls, progress and actionable empty results', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Course Teacher', role: 'educator' });
  hooks.setApi(async () => [courseFixture({ enrolled_at: '2026-01-01', done: 2 })]);
  const route = hooks.routes.find((entry) => entry.re.test('/learn'));
  const page = (await route.fn(null, new URLSearchParams())).s;
  assert.match(page, /data-form="course-search"/);
  assert.match(page, /All courses[\s\S]*Enrolled[\s\S]*In progress[\s\S]*Completed/);
  assert.match(page, /Inclusive Classrooms[\s\S]*40% complete[\s\S]*Continue learning/);
  const emptyPage = (await route.fn(null, new URLSearchParams('q=astronomy'))).s;
  assert.match(emptyPage, /No courses match “astronomy”/);
  assert.match(emptyPage, /href="#\/learn">View all courses/);
});

test('course detail clearly separates previews, locked lessons and enrollment', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Course Teacher', role: 'educator' });
  hooks.setApi(async () => ({
    course: courseFixture(), enrollment: null,
    lessons: [
      { id: 1, position: 1, title: 'Welcome', minutes: 10, body: 'Preview content', done: 0, locked: false },
      { id: 2, position: 2, title: 'Protected practice', minutes: 20, body: null, done: 0, locked: true },
    ],
  }));
  const route = hooks.routes.find((entry) => entry.re.test('/course/7'));
  const match = '/course/7'.match(route.re);
  const page = (await route.fn(match)).s;
  assert.match(page, /Preview lesson/);
  assert.match(page, /Preview the first lesson, then enroll to unlock the full curriculum/);
  assert.match(page, /🔒 Protected practice/);
  assert.match(page, /data-action="enroll" data-id="7"/);
  assert.doesNotMatch(page, /data-action="complete-lesson"/);
});

test('learning workspace remains responsive and token-driven in both themes', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /\.course-catalogue \{ grid-template-columns: repeat\(auto-fill/);
  assert.match(css, /\.course-learning-layout \{ grid-template-columns:/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.course-learning-layout/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.course-catalogue \{ grid-template-columns: 1fr/);
  assert.match(css, /\.course-card h2 a \{ color: var\(--ink\)/);
  assert.match(css, /\.dashboard-stats \.stat-icon[^{]*\{[^}]*var\(--board-soft\)/);
});

function workshopFixture(overrides = {}) {
  return {
    id: 4, title: 'Assessment for Learning', description: 'Practical formative assessment strategies for everyday classrooms.',
    facilitator: 'Dr Meera Rao', category: 'Assessment', mode: 'Online', location: 'TeachersInn Live',
    starts_at: '2030-12-10T10:00:00Z', duration_min: 90, capacity: 50, cpd_hours: 2,
    registered_count: 12, registered: 0, attended: null, registered_at: null,
    ...overrides,
  };
}

test('workshop catalogue combines search, schedule, registration and delivery filters', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Workshop Teacher', role: 'educator' });
  const workshops = [
    workshopFixture(),
    workshopFixture({ id: 5, title: 'Inclusive Practice', mode: 'In-person', starts_at: '2020-01-10T10:00:00Z', registered: 1, attended: 0 }),
    workshopFixture({ id: 6, title: 'Digital Pedagogy', registered: 1, attended: 1 }),
  ];
  hooks.setApi(async (method, requestPath) => { assert.equal(`${method} ${requestPath}`, 'GET /api/workshops'); return workshops; });
  const route = hooks.routes.find((entry) => entry.re.test('/workshops'));
  const searched = (await route.fn(null, new URLSearchParams('v=all&q=inclusive'))).s;
  assert.match(searched, /Inclusive Practice/);
  assert.doesNotMatch(searched, /Assessment for Learning/);
  const attended = (await route.fn(null, new URLSearchParams('v=attended'))).s;
  assert.match(attended, /Digital Pedagogy/);
  assert.match(attended, /Attendance verified/);
  const inPerson = (await route.fn(null, new URLSearchParams('v=all&mode=inperson'))).s;
  assert.match(inPerson, /Inclusive Practice/);
  assert.doesNotMatch(inPerson, /Digital Pedagogy/);
});

test('workshop cards and details expose real schedule, CPD and verification state', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Workshop Teacher', role: 'educator' });
  const workshop = workshopFixture({ registered: 1, attended: 0 });
  hooks.setApi(async () => [workshop]);
  const listRoute = hooks.routes.find((entry) => entry.re.test('/workshops'));
  const listPage = (await listRoute.fn(null, new URLSearchParams('v=mine'))).s;
  assert.match(listPage, /data-form="workshop-search"/);
  assert.match(listPage, /Assessment for Learning/);
  assert.match(listPage, /Registered/);
  assert.match(listPage, /Add to calendar/);
  const detailRoute = hooks.routes.find((entry) => entry.re.test('/workshop/4'));
  const detailPage = (await detailRoute.fn('/workshop/4'.match(detailRoute.re))).s;
  assert.match(detailPage, /2 CPD hrs after verified attendance/);
  assert.match(detailPage, /Dr Meera Rao/);
  assert.match(detailPage, /90 minutes/);
  assert.match(detailPage, /Cancel registration/);
});

test('teacher workshop details distinguish pending, attended and absent states', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Workshop Teacher', role: 'educator' });
  const detailRoute = hooks.routes.find((entry) => entry.re.test('/workshop/4'));
  for (const [status, message] of [['pending', 'Attendance verification is pending'], ['attended', 'Your attendance has been verified'], ['absent', 'Attendance was not verified for this workshop']]) {
    hooks.setApi(async () => [workshopFixture({ starts_at: '2020-12-10T10:00:00Z', registered: 1, attended: status === 'attended' ? 1 : 0, attendance_status: status })]);
    const page = (await detailRoute.fn('/workshop/4'.match(detailRoute.re))).s;
    assert.match(page, new RegExp(message));
  }
});

test('administrator attendance UI shows private registration controls and summaries', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ id: 1, name: 'Administrator', role: 'admin' });
  hooks.setApi(async (method, requestPath) => {
    if (requestPath === '/api/admin/workshops') return [{ id: 8, title: 'Past workshop', starts_at: '2020-10-10T10:00:00Z', registrations: 3, pending: 1, attended: 1, absent: 1 }];
    if (requestPath.startsWith('/api/admin/workshops/8/registrations')) return [{ registration_id: 22, registered_at: '2020-09-01T10:00:00Z', attendance_status: 'pending', attendance_verified_at: null, name: 'Asha Teacher', email: 'asha@test.local', workshop_id: 8, workshop_title: 'Past workshop', starts_at: '2020-10-10T10:00:00Z' }];
    throw new Error(`${method} ${requestPath}`);
  });
  const route = hooks.routes.find((entry) => entry.re.test('/admin/attendance'));
  const page = (await route.fn('/admin/attendance'.match(route.re), new URLSearchParams('workshop=8'))).s;
  assert.match(page, /Workshop attendance/);
  assert.match(page, /Registered[\s\S]*Pending[\s\S]*Attended[\s\S]*Absent/);
  assert.match(page, /Asha Teacher[\s\S]*asha@test\.local/);
  assert.match(page, /data-change="admin-attendance"/);
});

test('workshop empty states explain unavailable and unverified attendance views', async () => {
  const { hooks } = loadClient();
  hooks.setMe({ name: 'Workshop Teacher', role: 'educator' });
  hooks.setApi(async () => []);
  const route = hooks.routes.find((entry) => entry.re.test('/workshops'));
  assert.match((await route.fn(null, new URLSearchParams('v=upcoming'))).s, /No upcoming workshops are currently available/);
  assert.match((await route.fn(null, new URLSearchParams('v=mine'))).s, /not registered for any workshops/);
  assert.match((await route.fn(null, new URLSearchParams('v=attended'))).s, /No verified attendance yet/);
  assert.match((await route.fn(null, new URLSearchParams('v=all&q=robotics'))).s, /No workshops match “robotics”/);
});

test('workshop layout remains responsive and theme-token driven', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /\.workshop-card \{[^}]*grid-template-columns:/);
  assert.match(css, /\.workshop-facts \{[^}]*repeat\(2/);
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.workshop-card/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.workshop-facts \{ grid-template-columns: 1fr/);
  assert.match(css, /\.workshop-facts > div \{[^}]*var\(--line\)[^}]*var\(--paper-2\)/);
  assert.match(css, /\.attendance-summary \{[^}]*grid-template-columns:/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.attendance-table td::before/);
  assert.match(css, /grid-template-columns: var\(--sidebar-width\)/);
});

function educatorFixture(overrides = {}) {
  return { id: 12, name: 'Meera Rao', designation: 'Mathematics Teacher', school: 'Learning School', subjects: 'Mathematics', grades: '6–8', board: 'CBSE', city: 'Pune', state: 'Maharashtra', bio: 'I collaborate on inclusive classroom practice.', experience_years: 8, open_to_mentor: 1, connection_id: null, connection_status: null, direction: null, ...overrides };
}

test('educator directory renders professional cards and combined supported filters', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 1, name: 'Teacher', role: 'educator' });
  let requested = '';
  hooks.setApi(async (method, requestPath) => { requested = requestPath; return [educatorFixture()]; });
  const route = hooks.routes.find(entry => entry.re.test('/network'));
  const page = (await route.fn('/network'.match(route.re), new URLSearchParams('q=meera&subject=Mathematics&city=Pune&view=sent'))).s;
  assert.match(requested, /q=meera/); assert.match(requested, /view=sent/); assert.match(requested, /subject=Mathematics/); assert.match(requested, /city=Pune/);
  assert.match(page, /Meera Rao/); assert.match(page, /Mathematics Teacher/); assert.match(page, /Learning School/); assert.match(page, /inclusive classroom practice/); assert.match(page, /<b>1<\/b> educator found/);
  assert.match(page, /View profile/); assert.match(page, /\+ Connect/);
});

test('educator profile exposes professional fields without private account data', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 1, name: 'Teacher', role: 'educator' });
  hooks.setApi(async () => educatorFixture({ status: 'accepted', connection_id: 7 }));
  const route = hooks.routes.find(entry => entry.re.test('/network/profile/12'));
  const page = (await route.fn('/network/profile/12'.match(route.re))).s;
  assert.match(page, /Professional information/); assert.match(page, /Mathematics/); assert.match(page, /Grades/); assert.match(page, /Education board/); assert.match(page, /Message/); assert.match(page, /Remove/);
  assert.doesNotMatch(page, /password|session|token|email/i);
});

test('my network distinguishes accepted, received and sent requests', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 1, name: 'Teacher', role: 'educator' });
  hooks.setApi(async () => ({ accepted: [educatorFixture({ connection_id: 1, status: 'accepted' })], incoming: [educatorFixture({ id: 13, name: 'Incoming Teacher', connection_id: 2, status: 'pending' })], outgoing: [educatorFixture({ id: 14, name: 'Outgoing Teacher', connection_id: 3, status: 'pending' })] }));
  const route = hooks.routes.find(entry => entry.re.test('/network/requests'));
  const page = (await route.fn('/network/requests'.match(route.re), new URLSearchParams())).s;
  assert.match(page, /Received Requests/); assert.match(page, /Incoming Teacher/); assert.match(page, /Accept/); assert.match(page, /Decline/);
  assert.match(page, /Sent Requests/); assert.match(page, /Outgoing Teacher/); assert.match(page, /Request sent/); assert.match(page, /Cancel/);
});

test('messaging renders searchable conversations, escaped history and mobile navigation', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 1, name: 'Teacher', role: 'educator' });
  hooks.setApi(async (method, requestPath) => requestPath === '/api/messages' ? [{ id: 12, name: 'Meera Rao', designation: 'Teacher', last_body: 'Latest update', last_at: '2026-11-13T10:00:00Z', unread: 2 }] : { person: educatorFixture(), canMessage: true, messages: [{ id: 1, sender_id: 12, body: '<img src=x onerror=alert(1)>', created_at: '2026-11-13T09:00:00Z' }, { id: 2, sender_id: 1, body: 'Thank you', created_at: '2026-11-13T10:00:00Z' }] });
  const route = hooks.routes.find(entry => entry.re.test('/messages/12'));
  const page = (await route.fn('/messages/12'.match(route.re), new URLSearchParams())).s;
  assert.match(page, /conversation-search/); assert.match(page, /Latest update/); assert.match(page, /2 unread messages/); assert.match(page, /message-back/);
  assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(page, /<img src=x/);
  assert.match(page, /data-message-input/); assert.match(page, /type="submit" disabled/);
});

test('network and messaging layouts preserve themes, sidebar widths and mobile flow', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /\.educator-grid \{[^}]*auto-fill/); assert.match(css, /\.message-workspace \{[^}]*grid-template-columns:/);
  assert.match(css, /var\(--paper\)|var\(--card\)|var\(--board\)/); assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.message-workspace\.has-thread \.conversation-panel/);
  assert.match(css, /\.message-thread-panel \.bubble \{[^}]*overflow-wrap: anywhere/); assert.match(css, /grid-template-columns: var\(--sidebar-width\)/);
});

function careerProfileFixture(overrides = {}) {
  return { user_id: 4, name: 'Asha Teacher', email: 'asha@test.local', designation: 'Science Teacher', school: 'Learning School', city: 'Pune', state: 'Maharashtra', subjects: 'Science', grades: '6–8', board: 'CBSE', bio: 'Inquiry-led educator.', experience_years: 6, professional_summary: 'Science educator committed to inclusive inquiry.', previous_institutions: 'River School', responsibilities: 'Planned lessons and assessments.', qualifications: 'B.Sc.; B.Ed.', certifications: 'Assessment certificate', training: '', skills: 'Lesson planning', specializations: 'Middle school science', cv_template: 'modern', ...overrides };
}

function jobFixture(overrides = {}) {
  return { id: 9, title: 'Science Faculty', school: 'Learning School', city: 'Pune', job_type: 'Full-time', subject: 'Science', description: 'Teach middle-school science through inquiry and practical classroom learning.', status: 'open', created_at: '2026-11-01T10:00:00Z', applied: 0, application_status: null, ...overrides };
}

test('career overview presents real readiness, application counts and actions', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 4, name: 'Asha Teacher', role: 'educator' });
  hooks.setApi(async (method, requestPath) => requestPath === '/api/career' ? { profileCompletion: 75, hasCv: true, applications: 2, applied: 2 } : [{ id: 1, job_id: 9, title: 'Science Faculty', school: 'Learning School', status: 'applied', applied_at: '2026-11-02T10:00:00Z' }]);
  const route = hooks.routes.find(entry => entry.re.test('/jobs'));
  const page = (await route.fn('/jobs'.match(route.re), new URLSearchParams())).s;
  assert.match(page, /75%/); assert.match(page, /Update CV/); assert.match(page, /Browse jobs/); assert.match(page, /View applications/); assert.match(page, /Science Faculty/);
});

test('CV builder renders persisted owner data, rule-based assistance disclosure and print preview', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 4, name: 'Asha Teacher', role: 'educator' }); hooks.setApi(async () => careerProfileFixture());
  const route = hooks.routes.find(entry => entry.re.test('/jobs/cv'));
  const page = (await route.fn('/jobs/cv'.match(route.re), new URLSearchParams())).s;
  assert.match(page, /Personal information[\s\S]*Professional summary[\s\S]*Experience[\s\S]*Qualifications[\s\S]*Skills[\s\S]*Preview/);
  assert.match(page, /rule-based template/); assert.match(page, /Science educator committed to inclusive inquiry/); assert.match(page, /Classic Professional/); assert.match(page, /Modern Educator/);
  assert.match(page, /Print \/ Save as PDF/); assert.match(page, /browser’s print dialog/); assert.match(page, /cv-preview modern/);
});

test('job catalogue combines supported filters and displays persistent applied state', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 4, name: 'Asha Teacher', role: 'educator' }); let requestPath = '';
  hooks.setApi(async (method, pathValue) => { requestPath = pathValue; return [jobFixture({ applied: 1, application_status: 'applied' })]; });
  const route = hooks.routes.find(entry => entry.re.test('/jobs/browse'));
  const page = (await route.fn('/jobs/browse'.match(route.re), new URLSearchParams('q=science&subject=Science&city=Pune&type=Full-time&applied=1'))).s;
  for (const expected of ['q=science', 'subject=Science', 'city=Pune', 'type=Full-time', 'applied=1']) assert.match(requestPath, new RegExp(expected));
  assert.match(page, /Science Faculty/); assert.match(page, /Learning School/); assert.match(page, /Application submitted/); assert.match(page, /<b>1<\/b> role found/);
});

test('job details and application tracker use only actual supported fields and statuses', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 4, name: 'Asha Teacher', role: 'educator' });
  hooks.setApi(async (method, requestPath) => requestPath === '/api/jobs/9' ? jobFixture() : [{ id: 3, job_id: 9, title: 'Science Faculty', school: 'Learning School', city: 'Pune', job_type: 'Full-time', subject: 'Science', status: 'applied', applied_at: '2026-11-02T10:00:00Z', updated_at: '2026-11-02T10:00:00Z', job_status: 'open' }]);
  const detailRoute = hooks.routes.find(entry => entry.re.test('/job/9'));
  const detail = (await detailRoute.fn('/job/9'.match(detailRoute.re))).s;
  assert.match(detail, /Job description/); assert.match(detail, /Apply now/); assert.match(detail, /TeachersInn never charges/); assert.doesNotMatch(detail, /salary|deadline|vacanc/i);
  const jobsRoute = hooks.routes.find(entry => entry.re.test('/jobs/applications'));
  const tracker = (await jobsRoute.fn('/jobs/applications'.match(jobsRoute.re), new URLSearchParams())).s;
  assert.match(tracker, /Application #3/); assert.match(tracker, /Science Faculty/); assert.match(tracker, /applied/); assert.match(tracker, /Listing open/);
});

test('career hub remains print-safe, responsive, theme-token driven and sidebar compatible', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /\.career-hero \{[^}]*grid-template-columns:/); assert.match(css, /\.job-grid \{[^}]*auto-fill/); assert.match(css, /\.cv-builder-layout \{[^}]*grid-template-columns:/);
  assert.match(css, /@media print[\s\S]*\.cv-builder-layout[\s\S]*210mm[\s\S]*297mm/); assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.career-stats \{ grid-template-columns: 1fr/);
  assert.match(css, /var\(--board-soft\)|var\(--card\)/); assert.match(css, /grid-template-columns: var\(--sidebar-width\)/);
});

function discussionFixture(overrides = {}) {
  return { id: 21, community_id: 3, user_id: 7, title: 'Formative assessment routines', body: 'Share practical formative assessment routines that work in large classrooms.', created_at: '2026-11-10T10:00:00Z', community: 'Teaching Practice', icon: '✎', author: 'Meera Rao', designation: 'Science Teacher', replies: 4, last_activity: '2026-11-12T10:00:00Z', ...overrides };
}

test('community feed renders real discussions, categories and combined discovery controls', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 7, name: 'Meera Rao', role: 'educator' }); let requested = '';
  hooks.setApi(async (method, requestPath) => {
    if (requestPath === '/api/communities') return [{ id: 3, name: 'Teaching Practice', description: 'Classroom ideas', icon: '✎', posts: 1, last_post: '2026-11-10T10:00:00Z' }];
    requested = requestPath; return [discussionFixture()];
  });
  const route = hooks.routes.find(entry => entry.re.test('/community'));
  const page = (await route.fn('/community'.match(route.re), new URLSearchParams('q=formative&community=3&mine=1&sort=discussed'))).s;
  for (const expected of ['q=formative', 'community=3', 'mine=1', 'sort=discussed']) assert.match(requested, new RegExp(expected));
  assert.match(page, /Educator Community/); assert.match(page, /Formative assessment routines/); assert.match(page, /Meera Rao/); assert.match(page, /4 replies/); assert.match(page, /Teaching Practice/); assert.match(page, /<b>1<\/b> discussion found/);
  assert.match(page, /My discussions/); assert.match(page, /Most discussed/); assert.match(page, /Open discussion/); assert.match(page, /data-action="delete-post"/);
});

test('community feed provides professional empty states for filters and personal discussions', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 7, name: 'Meera Rao', role: 'educator' });
  hooks.setApi(async (method, requestPath) => requestPath === '/api/communities' ? [] : []);
  const route = hooks.routes.find(entry => entry.re.test('/community'));
  const mine = (await route.fn('/community'.match(route.re), new URLSearchParams('mine=1'))).s;
  assert.match(mine, /You have not started any discussions yet/); assert.match(mine, /Start a discussion/);
});

test('discussion details safely render content, ordered replies and authorized controls', async () => {
  const { hooks } = loadClient(); hooks.setMe({ id: 7, name: 'Meera Rao', role: 'educator' });
  hooks.setApi(async () => ({ post: { ...discussionFixture(), name: undefined }, replies: [{ id: 1, user_id: 8, author: 'Asha', designation: 'Teacher', body: '<img src=x onerror=alert(1)>', created_at: '2026-11-11T10:00:00Z' }, { id: 2, user_id: 7, author: 'Meera Rao', designation: 'Teacher', body: 'Thank you for sharing.', created_at: '2026-11-12T10:00:00Z' }] }));
  const route = hooks.routes.find(entry => entry.re.test('/post/21'));
  const page = (await route.fn('/post/21'.match(route.re))).s;
  assert.match(page, /Formative assessment routines/); assert.match(page, /2 replies/); assert.match(page, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.doesNotMatch(page, /<img src=x/);
  assert.match(page, /Submit reply/); assert.match(page, /Delete discussion/); assert.match(page, /data-action="delete-reply" data-id="2"/); assert.doesNotMatch(page, /data-action="delete-reply" data-id="1"/);
});

test('community UI remains responsive, theme-token driven and sidebar compatible', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  assert.match(css, /\.community-layout \{[^}]*grid-template-columns:/); assert.match(css, /\.discussion-feed \{[^}]*display: grid/); assert.match(css, /\.discussion-body \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.community-layout \{ grid-template-columns: 1fr/); assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.community-search \{ grid-template-columns: 1fr/);
  assert.match(css, /var\(--line\)|var\(--board-soft\)|var\(--card\)/); assert.match(css, /grid-template-columns: var\(--sidebar-width\)/);
});

test('every rendered action and form has exactly one registered handler', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  const uses = (pattern) => [...source.matchAll(pattern)].map((match) => match[1]);
  const definitions = (namespace) => uses(new RegExp(`${namespace}(?:\\.([A-Za-z0-9_-]+)|\\['([^']+)'\\])\\s*=`, 'g'));
  const normalizedDefinitions = (namespace) => [...source.matchAll(new RegExp(`${namespace}(?:\\.([A-Za-z0-9_-]+)|\\['([^']+)'\\])\\s*=`, 'g'))]
    .map((match) => match[1] || match[2]);
  const assertCompleteAndUnique = (label, rendered, registered) => {
    const duplicates = registered.filter((value, index) => registered.indexOf(value) !== index);
    assert.deepEqual(duplicates, [], `${label} handlers must not be overwritten by duplicate registration`);
    assert.deepEqual([...new Set(rendered)].sort(), [...new Set(registered)].sort(), `${label} markup and handlers must stay synchronized`);
  };

  assertCompleteAndUnique('action', uses(/data-action="([^"]+)"/g), normalizedDefinitions('actions'));
  assertCompleteAndUnique('form', uses(/data-form="([^"]+)"/g), normalizedDefinitions('forms'));
  assert.equal(definitions('actions').length, 37);
  assert.equal(definitions('forms').length, 39);
});

test('frontend API call sites map to the registered backend route contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'route-inventory.json'), 'utf8'));
  const callPattern = /api\(\s*'(GET|POST|PUT|DELETE)'\s*,\s*([`'"])(\/api\/.*?)\2/g;
  const calls = [...source.matchAll(callPattern)].map((match) => ({ method: match[1], template: match[3] }));
  calls.push({ method: 'GET', template: '/api/workshops/1/ics' });
  calls.push({ method: 'GET', template: '/api/profile/export' });

  const samplePath = (template) => {
    let value = template.replace(/\$\{[^}]+\}/g, '1');
    value = value.replace(/\$\{.*$/, '');
    return value.split('?')[0];
  };
  const routeMatches = (route, call) => {
    if (route.method !== call.method) return false;
    const escaped = route.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z][A-Za-z0-9]*/g, '[^/]+');
    return new RegExp(`^${escaped}$`).test(samplePath(call.template));
  };
  const mismatches = calls.filter((call) => !inventory.some((route) => routeMatches(route, call)));

  assert.ok(calls.length >= 90, 'the audit must cover the complete frontend API surface');
  assert.deepEqual(mismatches, []);
  assert.equal(inventory.length, 98);
});

test('generated forms associate sibling labels with their controls', () => {
  const { hooks } = loadClient();
  const control = { id: '' };
  const parent = { querySelector: () => control };
  const label = { parentElement: parent, htmlFor: '', contains: () => false };
  const root = {
    querySelector: () => null,
    querySelectorAll: (selector) => selector === 'label:not([for])' ? [label] : [],
  };

  hooks.applyDyn(root);

  assert.match(control.id, /^field-\d+$/);
  assert.equal(label.htmlFor, control.id);
});

test('modal semantics move focus inside and restore the invoking control', () => {
  const { sandbox, hooks } = loadClient();
  let currentModal = null; let inputFocused = 0; let triggerFocused = 0;
  const trigger = { isConnected: true, focus: () => { triggerFocused += 1; } };
  const input = { focus: () => { inputFocused += 1; } };
  sandbox.document.activeElement = trigger;
  sandbox.document.body = { appendChild: (element) => { currentModal = element; } };
  sandbox.document.createElement = () => ({
    className: '', id: '', innerHTML: '',
    querySelector: (selector) => selector.includes('input') ? input : null,
    querySelectorAll: () => [],
    remove: () => { currentModal = null; },
  });
  sandbox.document.querySelector = (selector) => selector === '#modal' ? currentModal : null;
  sandbox.document.querySelectorAll = () => [];

  hooks.openModal('Accessible dialog', hooks.html`<form><input></form>`);
  assert.equal(inputFocused, 1);
  assert.match(currentModal.innerHTML, /role="dialog"/);
  assert.match(currentModal.innerHTML, /aria-modal="true"/);
  assert.match(currentModal.innerHTML, /aria-labelledby="modal-title"/);
  hooks.closeModal();
  assert.equal(triggerFocused, 1);
});

test('navigation, focus and motion accessibility safeguards remain present', () => {
  const { hooks } = loadClient();
  hooks.setMe({ id: 1, name: 'Teacher', role: 'educator' });
  const page = hooks.layout('dashboard', '').s;
  const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'styles.css'), 'utf8');
  const index = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'index.html'), 'utf8');

  assert.match(page, /class="icon-btn menu-btn"[^>]*aria-controls="sidebar"[^>]*aria-expanded="false"/);
  assert.match(source, /sidebar\.inert = mobile && !open/);
  assert.match(source, /main\.inert = mobile && open/);
  assert.match(source, /mobileSidebar\?\.classList\.contains\('open'\)[\s\S]*e\.key === 'Tab'/);
  assert.match(source, /if \(opening\) \$\('a\[href\], button:not\(\[disabled\]\)'/);
  assert.match(source, /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /document\.activeElement === focusable\[0\]/);
  assert.match(source, /err\.setAttribute\('role', 'alert'\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: \.01ms/);
  assert.doesNotMatch(index, /id="app"[^>]*aria-live/);
  assert.match(index, /id="toast" role="status" aria-live="polite"/);
});

test('concurrent identical GET requests share one fetch without persistent caching', async () => {
  const { sandbox, hooks } = loadClient();
  let fetches = 0; let release;
  const gate = new Promise((resolve) => { release = resolve; });
  sandbox.fetch = async () => {
    fetches += 1;
    await gate;
    return { ok: true, status: 200, json: async () => ({ value: fetches }) };
  };

  const first = hooks.invokeApi('GET', '/api/dashboard');
  const second = hooks.invokeApi('GET', '/api/dashboard');
  assert.equal(fetches, 1);
  release();
  await Promise.all([first, second]);
  await hooks.invokeApi('GET', '/api/dashboard');
  assert.equal(fetches, 2, 'completed GET responses must not become a persistent private-data cache');
});

test('authentication mutations and unauthorized responses invalidate protected request state', async () => {
  const { sandbox, hooks } = loadClient();
  hooks.setMe({ id: 7, name: 'Teacher', role: 'educator' });
  hooks.setCsrf('csrf-secret');
  hooks.setRender(() => {});
  sandbox.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in required' }) });

  await assert.rejects(() => hooks.invokeApi('GET', '/api/dashboard'), /Sign in required/);

  assert.equal(hooks.getState().me, null);
  assert.equal(hooks.getState().csrf, '');
  assert.deepEqual(Object.keys(hooks.getState().cache), []);
  assert.equal(sandbox.location.hash, '#/');
});

test('badge refresh cannot publish a response after the authenticated identity changes', async () => {
  const { hooks } = loadClient();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  hooks.setMe({ id: 1, name: 'First Teacher', role: 'educator' });
  hooks.setApi(async (method, url) => {
    await gate;
    return url === '/api/dashboard' ? { stats: { unreadMessages: 9, pendingRequests: 4 } } : { unread: 7 };
  });

  const pending = hooks.refreshBadges();
  hooks.setMe({ id: 2, name: 'Second Teacher', role: 'educator' });
  release();
  await pending;

  assert.deepEqual(Object.keys(hooks.getState().cache), []);
});
