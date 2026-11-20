'use strict';

function createAuthRepository({ all, get, run }) {
  return {
    findUserByEmail: (email) => get('SELECT * FROM users WHERE email=?', email),
    findUserById: (id) => get('SELECT * FROM users WHERE id=?',id),
    findSession: (tokenHash) => get('SELECT * FROM sessions WHERE token_hash=?',tokenHash),
    touchSession: (tokenHash,lastSeen) => run('UPDATE sessions SET last_seen=? WHERE token_hash=?',lastSeen,tokenHash),
    purgeExpiredSessions: (now,idleBefore) => run('DELETE FROM sessions WHERE expires_at < ? OR last_seen < ?',now,idleBefore),
    createUser(values) {
      return run(`INSERT INTO users (name,email,password_hash,designation,school,subjects,consent_at,consent_version) VALUES (?,?,?,?,?,?,?,?)`, ...values);
    },
    resetLoginState: (userId, lastLoginAt) => run('UPDATE users SET failed_logins=0, locked_until=0, last_login_at=? WHERE id=?', lastLoginAt, userId),
    recordLoginFailure: (userId, failures, lockedUntil) => run('UPDATE users SET failed_logins=?, locked_until=? WHERE id=?', failures, lockedUntil, userId),
    updatePassword: (userId, passwordHash) => run('UPDATE users SET password_hash=? WHERE id=?', passwordHash, userId),
    createSession(values) {
      return run(`INSERT INTO sessions (token_hash,user_id,csrf_token,ip,user_agent,created_at,last_seen,expires_at) VALUES (?,?,?,?,?,?,?,?)`, ...values);
    },
    deleteSession: (tokenHash) => run('DELETE FROM sessions WHERE token_hash=?', tokenHash),
    deleteOtherSessions: (userId, tokenHash) => run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', userId, tokenHash),
    listSessions: (userId) => all('SELECT substr(token_hash,1,12) AS id, ip, user_agent, created_at, last_seen FROM sessions WHERE user_id=? ORDER BY last_seen DESC', userId),
  };
}

module.exports = { createAuthRepository };
