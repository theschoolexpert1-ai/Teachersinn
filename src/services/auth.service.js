'use strict';

function createAuthService({ repository, security, tx, audit, notify, nowIso, clientIp, sessionAbsoluteMs, sessionIdleMs, lockAfter, lockMs, HttpError }) {
  function createSession(req, userId) {
    const token = security.randomToken(32);
    const now = Date.now();
    repository.createSession([
      security.sha256(token), userId, security.randomToken(24), clientIp(req),
      String(req.headers['user-agent'] || '').slice(0, 200), now, now, now + sessionAbsoluteMs,
    ]);
    return token;
  }

  return {
    loadLegacySession(token) {
      if (!token || token.length > 100) return null;
      const hash = security.sha256(token);
      const session = repository.findSession(hash);
      if (!session) return null;
      const now = Date.now();
      if (session.expires_at < now || session.last_seen + sessionIdleMs < now) { repository.deleteSession(hash); return null; }
      const user = repository.findUserById(session.user_id);
      if (!user || user.status !== 'active') { repository.deleteSession(hash); return null; }
      if (now - session.last_seen > 60_000) repository.touchSession(hash,now);
      return {...session,hash,user};
    },
    purgeExpiredSessions() { const now=Date.now();return repository.purgeExpiredSessions(now,now-sessionIdleMs); },
    register(ctx, input) {
      if (repository.findUserByEmail(input.email)) throw new HttpError(409, 'An account with this email already exists. Try signing in.');
      return tx(() => {
        const result = repository.createUser([
          input.name, input.email, security.hashPassword(input.password), input.designation,
          input.school, input.subjects, nowIso(), '1.0',
        ]);
        const userId = Number(result.lastInsertRowid);
        audit(userId, 'auth.register', input.email, ctx.ip);
        notify(userId, 'Welcome to TeachersInn! Start with a course or explore the tutorials library.', '#/learn');
        return createSession(ctx.req, userId);
      });
    },

    login(ctx, email, password) {
      const user = repository.findUserByEmail(email);
      const generic = new HttpError(401, 'Incorrect email or password.');
      if (!user) {
        security.verifyPassword(password, security.DUMMY_HASH);
        audit(null, 'auth.login_fail', `unknown:${email}`, ctx.ip);
        throw generic;
      }
      if (user.locked_until > Date.now()) {
        audit(user.id, 'auth.login_locked', '', ctx.ip);
        throw new HttpError(423, 'Account temporarily locked after repeated failed attempts. Try again in 15 minutes.');
      }
      if (!security.verifyPassword(password, user.password_hash)) {
        const failures = user.failed_logins + 1;
        repository.recordLoginFailure(user.id, failures >= lockAfter ? 0 : failures, failures >= lockAfter ? Date.now() + lockMs : 0);
        audit(user.id, failures >= lockAfter ? 'auth.locked' : 'auth.login_fail', '', ctx.ip);
        throw generic;
      }
      if (user.status !== 'active') {
        audit(user.id, 'auth.login_suspended', '', ctx.ip);
        throw new HttpError(403, 'This account is suspended. Contact support.');
      }
      const token = tx(() => {
        repository.resetLoginState(user.id, nowIso());
        if (ctx.session) repository.deleteSession(ctx.session.hash);
        const created = createSession(ctx.req, user.id);
        audit(user.id, 'auth.login', '', ctx.ip);
        return created;
      });
      return token;
    },

    logout(ctx) {
      tx(() => {
        repository.deleteSession(ctx.session.hash);
        audit(ctx.user.id, 'auth.logout', '', ctx.ip);
      });
    },

    changePassword(ctx, next) {
      tx(() => {
        repository.updatePassword(ctx.user.id, security.hashPassword(next));
        repository.deleteOtherSessions(ctx.user.id, ctx.session.hash);
        audit(ctx.user.id, 'auth.password_change', 'other sessions revoked', ctx.ip);
      });
    },
    listSessions(ctx) {
      return repository.listSessions(ctx.user.id).map((session) => ({ ...session, current: ctx.session.hash.startsWith(session.id) }));
    },

    logoutOthers(ctx) {
      const result = repository.deleteOtherSessions(ctx.user.id, ctx.session.hash);
      audit(ctx.user.id, 'auth.logout_others', `${result.changes} sessions`, ctx.ip);
      return Number(result.changes);
    },
  };
}

module.exports = { createAuthService };
