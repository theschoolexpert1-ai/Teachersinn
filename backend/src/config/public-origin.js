'use strict';

const DEFAULT_PUBLIC_ORIGIN = 'https://teachersinn.schoolexpert.in';

function publicOrigin(env = process.env) {
  const value = String(env.PUBLIC_APP_ORIGIN || DEFAULT_PUBLIC_ORIGIN).trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('PUBLIC_APP_ORIGIN must be an absolute HTTP(S) URL.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('PUBLIC_APP_ORIGIN must contain only an HTTP(S) origin.');
  }
  return parsed.origin;
}

function verificationUrl(code, env = process.env) {
  const url = new URL('/verify', publicOrigin(env));
  url.searchParams.set('code', String(code || ''));
  return url.toString();
}

module.exports = { DEFAULT_PUBLIC_ORIGIN, publicOrigin, verificationUrl };
