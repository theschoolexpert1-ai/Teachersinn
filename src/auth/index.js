'use strict';

const SUPPORTED = new Set(['legacy', 'supabase']);

function authBackend(env = process.env) {
  const value = String(env.AUTH_BACKEND || 'legacy').trim().toLowerCase();
  if (!SUPPORTED.has(value)) throw new Error(`Unsupported AUTH_BACKEND "${value}". Expected legacy or supabase.`);
  return value;
}

function createAuthRuntime(options = {}) {
  const mode = authBackend(options.env);
  if (mode === 'legacy') return { mode };
  const { createSupabaseAuthBridge } = require('./supabase-bridge');
  return { mode, bridge: createSupabaseAuthBridge(options) };
}

module.exports = { authBackend, createAuthRuntime };
