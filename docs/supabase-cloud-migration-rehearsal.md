# Stage 3I disposable cloud migration rehearsal

## Scope and current state

The harness is `scripts/migration/cloud-rehearsal.js`. Its default behavior is read-only preflight. It cannot mutate unless four independent, process-local Stage 3I values match, including the exact project reference and the explicit authorization phrase. Stage 3G/3H flags do not satisfy the gate. No Stage 3I cloud mutation has been run.

The source is generated from `synthetic-fixture.js` using the real SQLite migrations. It contains three invented accounts—teacher, mentor, and administrator—and 26 synthetic application records spanning every migratable domain. The split user mapping produces a 26-batch, 32-row target plan across all 26 PostgreSQL application tables. The committed synthetic manifest contains stable local rehearsal UUIDs and `example.test` addresses only. During an authorized cloud run, the harness creates disposable Auth users, captures their actual UUIDs immediately into a permission-restricted temporary checkpoint, and builds a runtime manifest from those captured IDs.

## Required authorization gate

All of these must be set in the one authorized process:

- `RUN_STAGE3I_CLOUD_REHEARSAL=1`
- `STAGE3I_ALLOW_DISPOSABLE_MUTATIONS=1`
- `STAGE3I_PROJECT_REF=ivnmrhwxdawmzaakdhec`
- `STAGE3I_MUTATION_AUTHORIZATION=teachersinn-development:ivnmrhwxdawmzaakdhec:stage3i-synthetic-rehearsal`

The harness also verifies the URL host, database endpoint, Management API name/reference/health, verified TLS, 13 migrations, 26 RLS tables, 60 policies, four buckets, the account-deletion ACL, and a completely empty Auth/application/Storage baseline before creating anything.

## Execution, verification, and cleanup

Data is transformed into 26 dependency-ordered target batches. Each batch executes in a PostgreSQL transaction. Checkpoints are atomically replaced only after a committed batch and contain captured UUIDs and fingerprints but no credentials. A resumed run skips only a batch whose stored fingerprint exactly matches its plan.

Verification selects the exact transformed columns and compares deterministic content fingerprints for every table, including UUID ownership. PostgreSQL foreign keys and unique constraints remain enabled. A second execution with the completed checkpoint must write zero rows.

Cleanup uses the reverse dependency order and exact captured primary/composite keys. It never issues a database reset or an unqualified delete. Captured `legacy_user_map` rows are removed before the captured Auth identities, allowing profile/settings cascades without touching unrelated identities. Cleanup continues across application, pool, and Auth failures and reports any incomplete phase. The final step reruns the independent empty-project preflight.

## Auth/SQL failure matrix

| Failure point | Recovery behavior |
| --- | --- |
| Before Auth creation | No cloud state exists; stop safely |
| During Auth creation | Every returned UUID is checkpointed immediately; delete only captured UUIDs |
| After Auth creation, before SQL | Delete captured Auth identities; their trigger-created rows cascade |
| During a SQL batch | Roll back that batch; retain prior committed fingerprints; resume or captured cleanup |
| During verification | Treat as failure and clean all captured rows/identities; do not declare success |
| Interrupted process | Use the private checkpoint and exact fixture marker; inventory captured UUIDs before resume/cleanup |
| Repeated execution | Completed fingerprints skip writes; constraints and content verification prevent silent divergence |
| During cleanup | Continue independent cleanup phases, report residual phase, and do not retry destructive Auth deletion automatically |

Auth administration and PostgreSQL transactions are not atomic. The checkpoint is the recovery boundary; it is not a claim of distributed transactionality.

## Privilege requirements

The preferred database principal has only:

- `CONNECT` to the intended database.
- `USAGE` on `public` and required sequences.
- `SELECT`, `INSERT`, `UPDATE`, and `DELETE` only on the 26 mapped application tables.
- Sequence `USAGE/SELECT/UPDATE` only where preserved bigint IDs require reconciliation.
- Read-only catalog access needed for migration/RLS/ACL preflight.

Supabase Auth user creation/deletion separately requires the server-only Auth administration credential. It is never passed to SQL or written to checkpoints.

Multi-user import cannot operate through ordinary per-user RLS policies. The current configured database owner can bypass those policies, which is privileged. Before execution, explicitly approve that limited rehearsal use or provision a dedicated time-bounded migration principal. Do not grant `SUPERUSER`, do not disable RLS, and do not use the service-role key as an unrestricted application-data shortcut. Any future SECURITY DEFINER import function requires a separately reviewed additive migration and is outside this authorization.

## Remaining authorization

The exact future mutations are: create three captured disposable Auth users; insert/update only the synthetic plan rows across the 26 public tables; test an interrupted/resumed batch; read them for verification; delete exactly those captured rows; delete exactly the three captured Auth users; and verify zero residual state. No Storage object, migration, policy, function ACL, SMTP setting, runtime flag, or real record is in scope.

## First authorized execution result

The first authorized run stopped on PostgreSQL `22P02` while inserting JSONB tutorial steps. Controlled transaction rollback and checkpoint recovery had already executed, but final content verification and idempotency were not reached. Scoped cleanup succeeded and an independent read-only preflight confirmed zero Auth users and zero application or Storage records with all 13 migrations, 60 policies, 26 RLS tables, four buckets, TLS, and the function ACL preserved. The adapter now serializes tutorial-step arrays explicitly and has a local regression test. A second cloud mutation run requires fresh authorization because the original instructions required stopping further mutations after an unexpected failure.

The single authorized retry passed the corrected tutorial JSONB batch but stopped on PostgreSQL `55000` because the planner ordered enrollment before lesson insertion. The database correctly enforced its curriculum lock. Scoped cleanup again completed with an independently verified empty baseline. The dependency graph now requires `courses -> lessons -> enrollments -> lesson_progress`, with a local regression assertion. The retry authorization is exhausted; another cloud run requires new explicit authorization.

## Durable verification evidence

Future authorized rehearsals write an incremental, redacted report to
`.private/stage3i-rehearsals/<run-id>.migration-report.json`. The directory and
report extension are Git-ignored. Reports use atomic replacement, contain no
passwords, tokens, raw email addresses, or Auth UUID mappings, and remain on
disk after temporary fixture and cleanup files are removed.

Every required verification item has an independent `PASS`, `FAIL`,
`NOT_RUN`, or `BLOCKED` status. Lifecycle checkpoints cover preflight, identity
creation, import, content, ownership, foreign keys, idempotency, cleanup, and
the independent postflight. Missing evidence is never promoted to success.
The process exits successfully only when every required check and checkpoint
is `PASS`; report-write failure, incomplete cleanup, or missing evidence forces
a nonzero exit. Cleanup remains in the unconditional cleanup path and does not
depend on the terminal receiving the final JSON response.

No durable artifact survived the earlier detached rehearsal because this
facility did not yet exist. Its content, ownership, foreign-key, and
idempotency assertions therefore remain historically unavailable even though
the independent cleanup baseline passed.

The later durable run `2026-11-20T04-46-25-807Z-5bb2b800a561` stopped on a
content fingerprint mismatch, but the original verifier recorded only a
failure count. The historical table and column cannot be recovered. The
verifier now emits safe field-level diagnostics containing table, synthetic
record locator, column, category, representation types, and keyed comparison
fingerprints. It normalizes PostgreSQL timestamp, bigint, boolean, UUID,
JSONB, date, and null representations without exposing raw values or weakening
content comparison. A local PostgreSQL-driver representation simulation covers
all 26 fixture tables and does not reproduce the historical mismatch. Another
cloud rehearsal is therefore required to establish the exact remote cause,
under fresh project-specific authorization.

The next authorized diagnostic run established the mismatch precisely:
`lesson_plans.plan_date` was the expected ISO calendar-date string while the
PostgreSQL driver returned a JavaScript `Date`. The stored calendar date was
unchanged; the verifier lacked a schema-aware `date` representation rule.
Verification now converts a valid driver `Date` for an expected PostgreSQL
`date` to `YYYY-MM-DD`, without applying timestamp or general string coercion.
The durable run report is retained under run ID
`2026-11-20T05-15-21-364Z-e9ff864a311d`. Cleanup and independent postflight
passed; no automatic cloud retry was performed.

A subsequent run (`2026-11-20T05-48-43-918Z-6df4a642d877`) confirmed that
using UTC `toISOString()` was still incorrect in the configured positive UTC
offset: the PostgreSQL `date` parser constructed local midnight and UTC
serialization shifted the calendar day backward. Date-only canonicalization
now uses the `Date` object's local calendar components and never converts a
PostgreSQL `date` through UTC. The run stopped at content verification, cleaned
all captured records and identities, and passed independent postflight. No
automatic retry was performed.

## Complete verification SQL audit

After run `2026-11-20T09-07-04-704Z-efbca90410dd` exposed an invalid
`connections.recipient_id` ownership reference, every remaining rehearsal SQL
path was audited against a schema contract derived directly from the ordered
Supabase migration files. Ownership now uses `connections.addressee_id`.
Business verification also corrected the same relationship reference and the
workshop attendance lifecycle value (`attended`, not the nonexistent
`verified`).

The business verifier now covers course publication state, workshop attendance
and administrator evidence, capacity, accepted-connection/active-mentorship
message eligibility, certificate/completion agreement, complete lesson
progress, open-job applications, and self-connection/self-mentorship rejection.
Generated content selects, insert columns, cleanup keys, and all 26 target
tables are checked locally against the migration-derived contract before Auth
identity creation. Invalid tables or columns fail closed.

The completed-run idempotency check now requires all three conditions: the
checkpoint execution reports zero writes, the disposable Auth count remains
unchanged, and a second strict content verification confirms all 32 target
records remain unchanged. A read-only live PostgreSQL audit successfully
planned 54 ownership, business, content-select, and cleanup-delete queries with
`EXPLAIN` (without `ANALYZE`) and executed the foreign-key catalog query using
verified TLS. No cloud rows or identities were created.

The subsequent local constraint audit reviewed every schema trigger, workflow function, FK, unique/check rule, business prerequisite, and all 26 generated batches. It added validation for cross-domain rules that a privileged direct import would otherwise bypass. See `supabase-migration-constraint-audit.md`. No cloud mutation was performed during that audit.
