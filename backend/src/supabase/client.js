'use strict';

const { createClient } = require('@supabase/supabase-js');
const { publicConfig, serverConfig } = require('./config');

const SERVER_AUTH_OPTIONS = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
};

/**
 * User-scoped server client. RLS evaluates the verified access token attached
 * to each request; callers must still retain the application's business rules.
 */
function createUserClient(accessToken, env = process.env) {
  if (typeof accessToken !== 'string' || !accessToken.trim()) throw new Error('A Supabase access token is required.');
  const { url, publishableKey } = publicConfig(env);
  return createClient(url, publishableKey, {
    auth: SERVER_AUTH_OPTIONS,
    global: { headers: { Authorization: `Bearer ${accessToken.trim()}` } },
  });
}

/**
 * Privileged server-only client. The secret bypasses RLS and must be limited to
 * audited migration and administrative operations. Never send it to a browser.
 */
function createAdminClient(env = process.env) {
  const { url, secretKey } = serverConfig(env);
  return createClient(url, secretKey, { auth: SERVER_AUTH_OPTIONS });
}

module.exports = { createUserClient, createAdminClient };
