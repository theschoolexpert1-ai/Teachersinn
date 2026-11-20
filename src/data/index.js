'use strict';

/**
 * Persistence boundary for the staged Supabase migration.
 * SQLite remains the only active provider until the PostgreSQL adapter and
 * authentication cutover have passed integration and reconciliation checks.
 */
const backend = String(process.env.DATA_BACKEND || 'sqlite').toLowerCase();

if (backend === 'sqlite') {
  module.exports = require('../db');
} else if (backend === 'supabase') {
  throw new Error('DATA_BACKEND=supabase is not enabled in Stage A. Complete and verify the application data adapter before cutover.');
} else {
  throw new Error(`Unsupported DATA_BACKEND: ${backend}`);
}
