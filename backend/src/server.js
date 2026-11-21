'use strict';
/**
 * TeachersInn — HTTP server & REST API (zero external dependencies).
 * © Poornaphala Media and Infotech Services LLP. All rights reserved.
 */
if (String(process.env.DATA_BACKEND || 'sqlite').toLowerCase() === 'postgres') {
  const runtime = require('./postgres/runtime').createPostgresRuntime({ env: process.env });
  const server = runtime.server;
  if (require.main === module) {
    const port = Number(process.env.PORT || 3000), host = process.env.HOST || '0.0.0.0';
    server.listen(port, host, () => console.log(`TeachersInn PostgreSQL runtime listening on ${host}:${port}`));
    const shutdown = () => runtime.shutdown().finally(() => process.exit(0));
    process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
  }
  module.exports = server;
} else {
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { db, all, get, run, tx } = require('./data');
const S = require('./security');
const { seedIfEmpty } = require('./seed');
const { createAuthRuntime } = require('./auth');
const { createAuthRepository } = require('./repositories/auth.repository');
const { createLearningRepository } = require('./repositories/learning.repository');
const { createMessagingRepository } = require('./repositories/messaging.repository');
const { createAdminRepository } = require('./repositories/admin.repository');
const { createActivityRepository } = require('./repositories/activity.repository');
const { createWorkshopsRepository } = require('./repositories/workshops.repository');
const { createCommunityRepository } = require('./repositories/community.repository');
const { createSupportRepository } = require('./repositories/support.repository');
const { createMentorshipRepository } = require('./repositories/mentorship.repository');
const { createAuthService } = require('./services/auth.service');
const { createLearningService } = require('./services/learning.service');
const { createMessagingService } = require('./services/messaging.service');
const { createAdminService } = require('./services/admin.service');
const { createWorkshopsService } = require('./services/workshops.service');
const { createCommunityService } = require('./services/community.service');
const { createSupportService } = require('./services/support.service');
const { createMentorshipService } = require('./services/mentorship.service');
const { createProfilesRepository } = require('./repositories/profiles.repository');
const { createSettingsRepository } = require('./repositories/settings.repository');
const { createNotificationsRepository } = require('./repositories/notifications.repository');
const { createProfilesService } = require('./services/profiles.service');
const { createSettingsService } = require('./services/settings.service');
const { createNotificationsService } = require('./services/notifications.service');
const { OPTIONAL_CATEGORIES, FILTER_CATEGORIES, CATEGORY_SQL, categoryFor } = require('./notifications/categories');
const { createCareersRepository } = require('./repositories/careers.repository');
const { createLessonPlansRepository } = require('./repositories/lesson-plans.repository');
const { createTutorialsRepository } = require('./repositories/tutorials.repository');
const { createCareersService } = require('./services/careers.service');
const { createLessonPlansService } = require('./services/lesson-plans.service');
const { createTutorialsService } = require('./services/tutorials.service');
const { createDashboardRepository } = require('./repositories/dashboard.repository');
const { createDashboardService } = require('./services/dashboard.service');
const { workshopCalendar } = require('./utils/workshop-calendar');
const { verificationUrl } = require('./config/public-origin');
const { mapDatabaseError } = require('./postgres/errors');
const { registerDashboardRoutes } = require('./routes/dashboard.routes');
const { registerCommunityRoutes } = require('./routes/community.routes');
const { registerLearningRoutes } = require('./routes/learning.routes');
const { registerNotificationRoutes } = require('./routes/notifications.routes');
const { registerTutorialRoutes } = require('./routes/tutorials.routes');
const { registerLessonPlanRoutes } = require('./routes/lesson-plans.routes');
const { registerCareerRoutes } = require('./routes/careers.routes');
const { registerWorkshopRoutes } = require('./routes/workshops.routes');
const { registerNetworkingRoutes } = require('./routes/networking.routes');
const { createAuthAdapter } = require('./http/auth-adapter');
const { registerAuthRoutes } = require('./routes/auth.routes');
const { registerProfileRoutes } = require('./routes/profiles.routes');
const { registerSettingsRoutes } = require('./routes/settings.routes');
const { registerSupportRoutes } = require('./routes/support.routes');
const { registerMentorshipRoutes } = require('./routes/mentorship.routes');
const { registerAdminRoutes } = require('./routes/admin.routes');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1';
const APP_ORIGIN = process.env.APP_ORIGIN || '';  // e.g. https://teachersinn.in — locks the Origin check
const PUBLIC_DIR = path.join(__dirname, '..', '..', 'frontend');
const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;      // 12h idle timeout
const SESSION_ABS_MS = 7 * 24 * 60 * 60 * 1000;   // 7 day absolute lifetime
const MAX_BODY = 64 * 1024;
const LOCK_AFTER = 5, LOCK_MS = 15 * 60 * 1000;
const CPD_GOAL = 50; // CBSE asks teachers for 50 hours of CPD a year

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const nowIso = () => new Date().toISOString();

function databaseHttpError(error) {
  if (error && error.status) return error;
  const code = Number(error && error.errcode);
  const primary = Number.isInteger(code) ? (code & 0xff) : 0;
  if (primary === 5 || primary === 6) return Object.assign(new HttpError(503, 'The service is temporarily busy. Please retry shortly.'), { retryAfter: 1 });
  if (primary === 19) return new HttpError(409, 'The requested change conflicts with an existing or related record.');
  return mapDatabaseError(error);
}

// ------------------------------------------------------------------ helpers
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
function isSecure(req) {
  return COOKIE_SECURE || (TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https');
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const name = part.slice(0, i).trim();
    if (!name) continue;
    try { out[name] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { /* Ignore malformed cookie pairs; they cannot establish a session. */ }
  }
  return out;
}
function sessionCookieName(req) { return isSecure(req) ? '__Host-tin_sid' : 'tin_sid'; }
function setSessionCookie(res, req, token, maxAgeSec) {
  const secure = isSecure(req);
  const parts = [`${sessionCookieName(req)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) return reject(new HttpError(400, 'Expected a JSON object.'));
        resolve(v);
      } catch { reject(new HttpError(400, 'Malformed JSON.')); }
    });
    req.on('error', reject);
  });
}
const activityRepository = createActivityRepository({ get, run });
function audit(userId, action, detail, ip) { activityRepository.audit(userId, action, detail, ip); }
function notify(userId, text, link = '', explicitCategory = '') {
  const category = categoryFor(link, explicitCategory);
  if (category && activityRepository.notificationPreference(userId, category) === 0) return false;
  activityRepository.notify(userId, text, link);
  return true;
}
const PUBLIC_USER = 'id,name,role,designation,school,subjects,grades,board,city,state,bio,experience_years,open_to_mentor';
function publicUser(id) { return get(`SELECT ${PUBLIC_USER} FROM users WHERE id=? AND status='active'`, id); }
function selfUser(u) {
  const { password_hash, failed_logins, locked_until, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
}

const authRuntime = createAuthRuntime({
  env: process.env,
  resolveLegacyUser(legacyId, authEmail, mappedEmail, account) {
    const user = get('SELECT * FROM users WHERE id=?', legacyId);
    const normalized = String(authEmail || '').trim().toLowerCase();
    if (!user || user.status !== 'active' || user.email.toLowerCase() !== normalized || mappedEmail !== normalized) return null;
    return { ...user, role: account.role, status: account.status };
  },
});

// ------------------------------------------------------------------ sessions
function loadLegacySession(req) {
  const token = parseCookies(req)[sessionCookieName(req)];
  return authService.loadLegacySession(token);
}
async function loadActiveSession(req, res) {
  return authRuntime.mode === 'supabase' ? authRuntime.bridge.load(req, res) : loadLegacySession(req);
}
setInterval(() => {
  authService.purgeExpiredSessions();
}, 30 * 60_000).unref();

// ------------------------------------------------------------------ router
const routes = [];
/** access: 'public' | 'user' | 'mentor' | 'admin' */
function route(method, pattern, access, handler) {
  if (routes.some((entry)=>entry.method===method&&entry.pattern===pattern)) throw new Error(`Duplicate route: ${method} ${pattern}`);
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, pattern, re, keys, access, handler });
}
const id = (v) => S.int(v, { field: 'id', min: 1 });

const authService = createAuthService({
  repository: createAuthRepository({ all, get, run }), security: S, tx, audit, notify,
  nowIso, clientIp, sessionAbsoluteMs: SESSION_ABS_MS, sessionIdleMs: SESSION_IDLE_MS, lockAfter: LOCK_AFTER, lockMs: LOCK_MS, HttpError,
});
const learningService = createLearningService({
  repository: createLearningRepository({ all, get, run }), tx, notify, audit, nowIso,
  randomCertificate: () => 'TIN-' + crypto.randomBytes(5).toString('hex').toUpperCase(), verificationUrl, HttpError,
});
const messagingService = createMessagingService({
  repository: createMessagingRepository({ all, get, run, publicUserColumns:PUBLIC_USER }), tx, notify, publicUser,
  directoryVisible: (userId) => !!get('SELECT directory_visible FROM users WHERE id=?', userId)?.directory_visible,
  nowIso, HttpError,
});
const adminService = createAdminService({ repository: createAdminRepository({ all, get, run }), tx, audit, HttpError });
const workshopsService = createWorkshopsService({ repository: createWorkshopsRepository({ all, get, run }), tx, notify, audit, nowIso, calendar:workshopCalendar, HttpError });
const communityService = createCommunityService({ repository: createCommunityRepository({ all, get, run }), tx, notify, audit, HttpError });
const supportService = createSupportService({ repository: createSupportRepository({ all, get, run }), tx, notify, audit, nowIso, HttpError });
const mentorshipService = createMentorshipService({ repository: createMentorshipRepository({ all, get, run }), tx, notify, HttpError, publicUserColumns: PUBLIC_USER });
const profilesService = createProfilesService({ repository:createProfilesRepository({all,get,run}),security:S,tx,audit,nowIso,safeUser:selfUser,HttpError });
const settingsService = createSettingsService({ repository:createSettingsRepository({get,run}),audit,preferenceKeys:OPTIONAL_CATEGORIES });
const notificationsService = createNotificationsService({ repository:createNotificationsRepository({all,get,run,categorySql:CATEGORY_SQL}),nowIso,HttpError });
const careersService = createCareersService({ repository:createCareersRepository({all,get,run}),tx,audit,nowIso,HttpError });
const lessonPlansService = createLessonPlansService({ repository:createLessonPlansRepository({all,get,run}),HttpError });
const tutorialsService = createTutorialsService({ repository:createTutorialsRepository({all,get,run}),HttpError });
const dashboardService = createDashboardService({repository:createDashboardRepository({all,get}),nowIso,cpdGoal:CPD_GOAL});
const authAdapter=createAuthAdapter({runtime:authRuntime,service:authService,setCookie:setSessionCookie,sessionMaxAge:SESSION_ABS_MS/1000});

// ================================================================== AUTH
registerAuthRoutes({route,adapter:authAdapter,security:S,HttpError,safeUser:selfUser,cpdGoal:CPD_GOAL});

// ================================================================== PROFILE & PRIVACY (DPDP)
registerProfileRoutes({route,service:profilesService,security:S});
registerSettingsRoutes({route,settings:settingsService,profiles:profilesService,authAdapter});

// ================================================================== DASHBOARD
registerDashboardRoutes({route,dashboardService});

registerNotificationRoutes({route,service:notificationsService,security:S,id,filterCategories:FILTER_CATEGORIES});

// ================================================================== UPSKILLING
registerLearningRoutes({route,service:learningService,security:S,id});

// ================================================================== WORKSHOPS
registerWorkshopRoutes({route,service:workshopsService,security:S,id});

// ================================================================== NETWORKING
registerNetworkingRoutes({route,service:messagingService,security:S,id});

// ---- Communities / forums
registerCommunityRoutes({route,communityService,security:S,id});

// ================================================================== SUPPORT
const TICKET_CATS = ['Account & Login', 'Courses & Certificates', 'Workshops', 'Technical Issue', 'Classroom Help', 'Report a Concern', 'Other'];
registerSupportRoutes({route,service:supportService,security:S,id,categories:TICKET_CATS});
registerMentorshipRoutes({route,service:mentorshipService,security:S,id});

// ================================================================== TUTORIALS
registerTutorialRoutes({route,service:tutorialsService,id});

// ================================================================== LESSON PLANNER
registerLessonPlanRoutes({route,service:lessonPlansService,security:S,id});

// ================================================================== JOBS
registerCareerRoutes({route,service:careersService,adminService,security:S,id});

// ================================================================== ADMIN
registerAdminRoutes({route,admin:adminService,support:supportService,security:S,id});

// ================================================================== STATIC FILES
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); } catch { return send(res, 400, { error: 'Bad path' }); }
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'Forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // Unknown non-asset paths fall back to the app shell
      if (!path.extname(rel)) return serveStatic(req, res, '/');
      res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600', 'Content-Length': st.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ================================================================== REQUEST PIPELINE
const server = http.createServer(async (req, res) => {
  const secure = isSecure(req);
  S.securityHeaders(res, { secure });
  res.setHeader('X-Powered-By', 'TeachersInn');
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'Bad request' }); }
  const ip = clientIp(req);

  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    return serveStatic(req, res, url.pathname);
  }

  try {
    const lim = S.limiters.api.hit(ip);
    if (!lim.ok) throw Object.assign(new HttpError(429, 'Too many requests. Slow down a little.'), { retryAfter: lim.retryAfter });

    const match = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if (!match) {
      const any = routes.some(r => r.re.test(url.pathname));
      throw new HttpError(any ? 405 : 404, any ? 'Method not allowed.' : 'Not found.');
    }
    const params = {};
    const m = url.pathname.match(match.re);
    match.keys.forEach((k, i) => { params[k] = m[i + 1]; });

    const session = await loadActiveSession(req, res);
    const isWrite = req.method !== 'GET' && req.method !== 'HEAD';

    if (isWrite) {
      // 1) Origin check — blocks cross-site form posts and fetches
      const origin = req.headers.origin;
      const expected = APP_ORIGIN || `${secure ? 'https' : 'http'}://${req.headers.host}`;
      if (origin && origin !== expected) throw new HttpError(403, 'Cross-origin request blocked.');
      // 2) JSON only — HTML forms cannot send application/json cross-site without CORS preflight
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new HttpError(415, 'Content-Type must be application/json.');
      // 3) Synchroniser CSRF token for authenticated requests
      if (session && !S.safeEqual(req.headers['x-csrf-token'] || '', session.csrf_token)) throw new HttpError(403, 'Security token missing or expired. Refresh the page.');
    }

    if (match.access !== 'public') {
      if (!session || !session.user) throw new HttpError(401, 'Please sign in to continue.');
      if (match.access === 'admin' && session.user.role !== 'admin') { audit(session.user.id, 'authz.denied', url.pathname, ip); throw new HttpError(403, 'Administrators only.'); }
      if (match.access === 'mentor' && !['mentor', 'admin'].includes(session.user.role)) throw new HttpError(403, 'Mentors only.');
      if (isWrite) {
        const w = S.limiters.write.hit('u' + session.user.id);
        if (!w.ok) throw new HttpError(429, 'You are doing that too quickly. Please wait a moment.');
      }
    }

    const body = isWrite ? await readBody(req) : {};
    const ctx = { req, res, ip, params, query: url.searchParams, body, session, user: session && session.user };
    const result = await match.handler(ctx);
    if (Array.isArray(result) && typeof result[0] === 'number') return send(res, result[0], result[1], result[2]);
    return send(res, 200, result ?? { ok: true });
  } catch (err) {
    const safeError = databaseHttpError(err);
    const status = safeError.status || 500;
    if (status >= 500) console.error(new Date().toISOString(), req.method, url.pathname, err);
    const headers = safeError.retryAfter ? { 'Retry-After': String(safeError.retryAfter) } : {};
    const clientMessage = safeError.status ? safeError.message : 'Something went wrong on our side. Please try again.';
    return send(res, status, { error: clientMessage }, headers);
  }
});

server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;

seedIfEmpty();
if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`TeachersInn running at http://localhost:${PORT}  —  © Poornaphala Media and Infotech Services LLP`));
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => {
      try { db.close(); } catch { /* The connection may already be closed. */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
module.exports = server;
server.routeInventory = routes.map(({method,pattern,access})=>({method,pattern,access}));
}
