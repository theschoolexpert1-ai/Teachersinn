'use strict';

function required(name, env = process.env) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for Supabase integration.`);
  return value;
}

function projectUrl(env = process.env) {
  const value = required('SUPABASE_URL', env);
  let url;
  try { url = new URL(value); } catch { throw new Error('SUPABASE_URL must be a valid HTTPS URL.'); }
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('SUPABASE_URL must use HTTPS outside local development.');
  }
  return url.toString().replace(/\/$/, '');
}

function publicConfig(env = process.env) {
  return {
    url: projectUrl(env),
    publishableKey: required('SUPABASE_PUBLISHABLE_KEY', env),
  };
}

function serverConfig(env = process.env) {
  return {
    ...publicConfig(env),
    secretKey: required('SUPABASE_SECRET_KEY', env),
  };
}

module.exports = { publicConfig, serverConfig };
