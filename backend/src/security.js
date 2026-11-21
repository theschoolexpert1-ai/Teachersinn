'use strict';
/**
 * TeachersInn — security layer.
 *  - Password hashing: scrypt (memory-hard) with per-user random salt, constant-time compare
 *  - Sessions: 256-bit random tokens, only SHA-256 hashes stored server-side, idle + absolute expiry
 *  - CSRF: per-session synchroniser token + Origin check on every state-changing request
 *  - Rate limiting (per IP & per account), account lockout, strict security headers
 * © Poornaphala Media and Infotech Services LLP. All rights reserved.
 */
const crypto = require('node:crypto');

// ---------- Passwords ----------
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password.normalize('NFKC'), salt, KEYLEN, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length,
      { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

// A dummy hash so login timing is the same whether or not the email exists.
const DUMMY_HASH = hashPassword(crypto.randomBytes(16).toString('hex'));

const COMMON_PASSWORDS = new Set(['password123', 'qwerty12345', 'teacher@123', 'welcome123', '1234567890', 'iloveyou123', 'password@123', 'admin@1234']);
function passwordProblems(pw, email = '', name = '') {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters.';
  if (pw.length > 128) return 'Password must be at most 128 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'That password is too common. Choose another.';
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && pw.toLowerCase().includes(local)) return 'Password must not contain your email name.';
  const first = String(name).split(' ')[0].toLowerCase();
  if (first.length >= 4 && pw.toLowerCase().includes(first)) return 'Password must not contain your name.';
  return null;
}

// ---------- Tokens ----------
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
function safeEqual(a, b) {
  const A = Buffer.from(String(a)); const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// ---------- Rate limiting (fixed window, in-memory) ----------
class RateLimiter {
  constructor(limit, windowMs) { this.limit = limit; this.windowMs = windowMs; this.hits = new Map(); }
  /** @returns {{ok:boolean, retryAfter:number}} */
  hit(key) {
    const now = Date.now();
    let e = this.hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + this.windowMs }; this.hits.set(key, e); }
    e.count++;
    if (this.hits.size > 50000) this.sweep();
    return { ok: e.count <= this.limit, retryAfter: Math.ceil((e.reset - now) / 1000) };
  }
  sweep() { const now = Date.now(); for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k); }
}
const limiters = {
  api: new RateLimiter(300, 60_000),        // 300 req/min per IP
  login: new RateLimiter(10, 15 * 60_000),  // 10 attempts / 15 min per IP
  register: new RateLimiter(5, 60 * 60_000),// 5 sign-ups / hour per IP
  write: new RateLimiter(60, 60_000),       // 60 writes/min per user
};
setInterval(() => Object.values(limiters).forEach(l => l.sweep()), 5 * 60_000).unref();

// ---------- Security headers ----------
function securityHeaders(res, { secure }) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
    "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'",
    "form-action 'self'", "frame-ancestors 'none'", 'upgrade-insecure-requests',
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

// ---------- Validation helpers ----------
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$/;
class ValidationError extends Error { constructor(msg) { super(msg); this.name = 'ValidationError'; this.status = 400; } }

/** Clean a string field: trim, strip control chars, enforce length. */
function str(v, { field, max = 200, min = 0, required = false } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new ValidationError(`${field} is invalid.`);
  // eslint-disable-next-line no-control-regex
  const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (required && !s) throw new ValidationError(`${field} is required.`);
  if (s.length < min) throw new ValidationError(`${field} must be at least ${min} characters.`);
  if (s.length > max) throw new ValidationError(`${field} must be at most ${max} characters.`);
  return s;
}
function int(v, { field, min = 0, max = 1e9, def } = {}) {
  if ((v === undefined || v === '' || v === null) && def !== undefined) return def;
  if (typeof v === 'boolean' || (typeof v === 'object' && v !== null)) {
    throw new ValidationError(`${field} must be a whole number between ${min} and ${max}.`);
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new ValidationError(`${field} must be a whole number between ${min} and ${max}.`);
  return n;
}
function oneOf(v, options, field) {
  if (!options.includes(v)) throw new ValidationError(`${field} must be one of: ${options.join(', ')}.`);
  return v;
}
function email(v) {
  const e = str(v, { field: 'Email', max: 254, required: true }).toLowerCase();
  if (!EMAIL_RE.test(e)) throw new ValidationError('Enter a valid email address.');
  return e;
}

module.exports = {
  hashPassword, verifyPassword, DUMMY_HASH, passwordProblems,
  randomToken, sha256, safeEqual, limiters, securityHeaders,
  ValidationError, RateLimiter, str, int, oneOf, email,
};
