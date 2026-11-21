'use strict';

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { publicConfig, serverConfig } = require('../supabase/config');
const S = require('../security');

const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const REFRESH_SKEW = 90;
const refreshLocks = new Map();

class AuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requiredSecret(env) {
  const secret = String(env.AUTH_COOKIE_SECRET || '').trim();
  if (secret.length < 32) throw new Error('AUTH_COOKIE_SECRET must contain at least 32 characters when AUTH_BACKEND=supabase.');
  return crypto.createHash('sha256').update(secret).digest();
}

function cookieName(env) { return env.COOKIE_SECURE === '1' ? '__Host-tin_sbauth' : 'tin_sbauth'; }

function seal(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function open(value, key) {
  try {
    const raw = Buffer.from(String(value || ''), 'base64url');
    if (raw.length < 29) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index <= 0) continue;
    try { cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* invalid cookie */ }
  }
  return cookies;
}

function setCookie(res, name, value, maxAge, secure) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function authOptions() { return { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }; }

function createSupabaseAuthBridge({ env = process.env, resolveLegacyUser, clientFactory = createClient } = {}) {
  const publicValues = publicConfig(env);
  const serverValues = serverConfig(env);
  const key = requiredSecret(env);
  const name = cookieName(env);
  const secure = env.COOKIE_SECURE === '1';
  const origin = String(env.APP_ORIGIN || '').replace(/\/$/, '');
  if (!origin) throw new Error('APP_ORIGIN is required when AUTH_BACKEND=supabase.');
  const publicClient = () => clientFactory(publicValues.url, publicValues.publishableKey, authOptions());
  const adminClient = () => clientFactory(serverValues.url, serverValues.secretKey, authOptions());

  function clear(res) { setCookie(res, name, '', 0, secure); }
  function store(res, session, purpose = 'session', csrfToken = S.randomToken(24)) {
    const payload = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      purpose,
      csrf_token: csrfToken,
    };
    setCookie(res, name, seal(payload, key), SESSION_MAX_AGE, secure);
    return payload;
  }

  async function authoritativeIdentity(accessToken) {
    const client = publicClient();
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const admin = adminClient();
    const { data: account, error: accountError } = await admin.from('account_settings').select('role,status').eq('id', data.user.id).single();
    if (accountError || !account || account.status !== 'active') return null;
    const { data: mapping, error: mapError } = await admin.from('legacy_user_map')
      .select('legacy_user_id,normalized_email,migration_status').eq('auth_user_id', data.user.id).maybeSingle();
    if (mapError) throw new AuthError(503, 'Account mapping is temporarily unavailable.');
    let legacyUser = null;
    if (mapping && mapping.migration_status === 'claimed' && typeof resolveLegacyUser === 'function') {
      legacyUser = await resolveLegacyUser(mapping.legacy_user_id, data.user.email, mapping.normalized_email, account, data.user.id);
    }
    return { authUser: data.user, account, mapping, legacyUser };
  }

  async function refresh(payload) {
    const lockKey = crypto.createHash('sha256').update(payload.refresh_token).digest('hex');
    if (refreshLocks.has(lockKey)) return refreshLocks.get(lockKey);
    const work = (async () => {
      const { data, error } = await publicClient().auth.refreshSession({ refresh_token: payload.refresh_token });
      if (error || !data.session) return null;
      return data.session;
    })().finally(() => refreshLocks.delete(lockKey));
    refreshLocks.set(lockKey, work);
    return work;
  }

  async function load(req, res) {
    let payload = open(parseCookies(req)[name], key);
    if (!payload?.access_token || !payload?.refresh_token || !payload?.csrf_token) return null;
    if (!Number.isFinite(payload.expires_at) || payload.expires_at <= Math.floor(Date.now() / 1000) + REFRESH_SKEW) {
      const refreshed = await refresh(payload);
      if (!refreshed) { clear(res); return null; }
      payload = store(res, refreshed, payload.purpose, payload.csrf_token);
    }
    const identity = await authoritativeIdentity(payload.access_token);
    if (!identity) { clear(res); return null; }
    return { ...payload, identity, user: identity.legacyUser || null };
  }

  async function register(values, res) {
    const { data, error } = await publicClient().auth.signUp({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: `${origin}/#/confirm`, data: { name: values.name } },
    });
    if (error) throw new AuthError(error.status === 429 ? 429 : 400, 'Unable to create the account. Check the details or try signing in.');
    if (!data.user) throw new AuthError(503, 'Account registration did not complete.');
    const admin = adminClient();
    const { error: profileError } = await admin.from('profiles').update({
      name: values.name, designation: values.designation, school: values.school, subjects: values.subjects,
    }).eq('id', data.user.id);
    const { error: accountError } = await admin.from('account_settings').update({
      consent_at: new Date().toISOString(), consent_version: '1.0',
    }).eq('id', data.user.id);
    if (profileError || accountError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new AuthError(503, 'The account profile could not be created. Please try again.');
    }
    if (data.session) store(res, data.session);
    return { ok: true, confirmationRequired: !data.session, dataReady: false };
  }

  async function login(email, password, res) {
    const { data, error } = await publicClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new AuthError(401, 'Incorrect email or password.');
    const identity = await authoritativeIdentity(data.session.access_token);
    if (!identity) throw new AuthError(403, 'This account is unavailable. Contact support.');
    if (!identity.legacyUser) throw new AuthError(409, 'Your account is verified, but application data has not been migrated yet.');
    store(res, data.session);
    return { ok: true };
  }

  async function logout(session, res) {
    if (session?.access_token && session?.refresh_token) {
      const client = publicClient();
      await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
      await client.auth.signOut({ scope: 'local' });
    }
    clear(res);
    return { ok: true };
  }

  async function requestRecovery(email) {
    await publicClient().auth.resetPasswordForEmail(email, { redirectTo: `${origin}/#/reset-password` });
    return { ok: true, message: 'If an account exists, a password-reset email will be sent.' };
  }

  async function verifyOtp(tokenHash, type, res) {
    if (!['signup', 'recovery'].includes(type)) throw new AuthError(400, 'Invalid verification request.');
    const { data, error } = await publicClient().auth.verifyOtp({ token_hash: tokenHash, type });
    if (error || !data.session) throw new AuthError(400, 'This verification link is invalid or expired.');
    const payload = store(res, data.session, type === 'recovery' ? 'recovery' : 'session');
    return { ok: true, csrf: payload.csrf_token, recovery: type === 'recovery' };
  }

  async function resetPassword(session, password, res) {
    if (!session || session.purpose !== 'recovery') throw new AuthError(401, 'A valid password-recovery session is required.');
    const client = publicClient();
    const { error: setError } = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (setError) { clear(res); throw new AuthError(401, 'The recovery session is invalid or expired.'); }
    const { error } = await client.auth.updateUser({ password });
    if (error) throw new AuthError(400, 'The password could not be updated. Request a new recovery link.');
    await client.auth.signOut({ scope: 'global' });
    clear(res);
    return { ok: true };
  }

  async function changePassword(session, currentPassword, nextPassword, res) {
    const email = session?.identity?.authUser?.email;
    if (!email) throw new AuthError(401, 'Please sign in again.');
    const verified = await publicClient().auth.signInWithPassword({ email, password: currentPassword });
    if (verified.error) throw new AuthError(400, 'Current password is incorrect.');
    const client = publicClient();
    const established = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (established.error) { clear(res); throw new AuthError(401, 'Please sign in again.'); }
    const { error } = await client.auth.updateUser({ password: nextPassword });
    if (error) throw new AuthError(400, 'The password could not be updated.');
    await client.auth.signOut({ scope: 'others' });
    if (established.data.session) store(res, established.data.session);
    return { ok: true };
  }

  async function logoutOthers(session) {
    const client = publicClient();
    const established = await client.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
    if (established.error) throw new AuthError(401, 'Please sign in again.');
    const { error } = await client.auth.signOut({ scope: 'others' });
    if (error) throw new AuthError(503, 'Other sessions could not be signed out.');
    return { ok: true, revoked: null };
  }

  async function verifyCurrentPassword(session, password) {
    const email = session?.identity?.authUser?.email;
    if (!email || !password) return false;
    const result = await publicClient().auth.signInWithPassword({ email, password });
    return !result.error && Boolean(result.data.session);
  }

  async function deleteAuthUser(authUserId) {
    const expected = String(authUserId || '').trim();
    if (!expected) throw new AuthError(401, 'Please sign in again.');
    const { error } = await adminClient().auth.admin.deleteUser(expected);
    if (error) throw new AuthError(503, 'Account deletion could not be completed.');
    return { ok: true };
  }

  return {
    name, load, register, login, logout, requestRecovery, verifyOtp, resetPassword, changePassword, logoutOthers,
    verifyCurrentPassword, deleteAuthUser, clear,
    _test: { seal: (value) => seal(value, key), open: (value) => open(value, key) },
  };
}

module.exports = { AuthError, createSupabaseAuthBridge };
