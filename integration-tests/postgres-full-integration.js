'use strict';
const assert=require('node:assert/strict');
assert.equal(process.env.RUN_SUPABASE_INTEGRATION,'1','RUN_SUPABASE_INTEGRATION=1 is required.');
assert.equal(process.env.RUN_STAGE3G_MUTATIONS,'1','RUN_STAGE3G_MUTATIONS=1 is required.');
assert.equal(process.env.SUPABASE_TEST_ALLOW_REMOTE,'1','Project-specific remote authorization is required.');
assert.equal(process.env.SUPABASE_TEST_PROJECT_REF,'ivnmrhwxdawmzaakdhec','The authorized Stage 3G project reference is required.');
// Stage 3G reuses the proven mutation suites under one explicit process-local gate.
process.env.RUN_STAGE3C_MUTATIONS='1';process.env.RUN_STAGE3D_MUTATIONS='1';process.env.RUN_STAGE3E_MUTATIONS='1';process.env.RUN_STAGE3F_MUTATIONS='1';
require('./postgres-user-repositories');
require('./postgres-learning-repositories');
require('./postgres-workshops-jobs');
require('./postgres-community-network');
require('./postgres-remaining-repositories');
