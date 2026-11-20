# Supabase Stage 3A Repository Architecture

> Stage 3H continuation: verified-identity propagation, route-facing async facades, loopback HTTP security testing, and the exact 98-route composition are implemented locally. The five former gaps are covered by administrator reporting and account-deletion orchestration. Migration `202611190009` is pending and unapplied. Nothing is connected to the active server; cloud HTTP mutations require new Stage 3H authorization.

> Stage 3G readiness: `src/postgres/integration.js` provides an isolated, fail-closed PostgreSQL repository graph gated by Supabase Auth, verified database configuration, and explicit runtime enablement. It is intentionally not connected to the active SQLite server. Architecture, data migration, Auth reconciliation, runtime activation, and rollback plans are documented in the Stage 3G readiness documents.

> Stage 3F extension: the complete 16-repository/159-method SQLite inventory is mapped in `supabase-repository-coverage-audit.md`. PostgreSQL repositories now cover the remaining mentorship, support, tutorials, lesson plans, and dashboard domains. Migration `202611190008_remaining_repository_security.sql` is applied; the gated cloud suite passes and independent cleanup/RLS verification is clean. See `supabase-remaining-repositories.md`.

> Stage 3E extension: async repositories now cover professional discovery, atomic connection lifecycle, eligible private messaging, community discussions/replies, owner-scoped notifications, and administrator moderation while reusing Stage 3B notification preferences. Additive migration `202611190007_community_network_security.sql` is applied; the gated four-identity cloud suite passes and independent cleanup/RLS verification is clean. See `supabase-community-repositories.md`.

> Stage 3D extension: async repositories now cover workshop discovery/registration, admin attendance, derived workshop CPD, local job discovery/applications, and admin job management while reusing the Stage 3B career profile repository. Migrations `202611190005_workshops_jobs_security.sql` and `202611190006_fix_workshop_attendance_ambiguity.sql` are applied; the project-specific cloud suite passes and independent cleanup/RLS verification is clean. See `supabase-workshops-careers-repositories.md`.

> Stage 3C extension: PostgreSQL learning and administrator-learning repositories now cover course discovery/lifecycle, ordered lesson previews, enrollment, atomic progress/completion, course CPD, certificates, and anonymous verification. Migration `202611190004_learning_repository_security.sql` is applied, the project-specific cloud suite passes, and independent cleanup/RLS verification is clean. See `supabase-learning-repositories.md`.

> Stage 3B extension: asynchronous PostgreSQL repositories now cover profiles/account state, career profiles, notification preferences, and administrator user management. They remain disconnected from the active SQLite runtime. Owner authorization uses the verified transaction-local Supabase UUID; admin operations also verify `public.is_admin()`. Migration `202611190003_admin_user_management.sql` exposes narrowly scoped admin email list/detail functions without granting Auth table access. The project-specific three-identity cloud suite and independent cleanup verification pass. See `supabase-user-repositories.md`.

Implementation date: 19 November 2026  
Active runtime: `DATA_BACKEND=sqlite`, `AUTH_BACKEND=legacy`  
Status: **STAGE 3A COMPLETE — READY FOR STAGE 3B**

## 1. Current architecture

TeachersInn uses a native Node.js HTTP dispatcher, domain route modules,
services containing business rules, and explicit repositories containing SQL.
The server injects the synchronous SQLite helpers `all`, `get`, `run`, and
`tx` into 14 repository factories. Services frequently call several repository
methods inside a synchronous SQLite transaction callback.

`src/data/index.js` remains the runtime persistence gate. It loads SQLite by
default and deliberately rejects `DATA_BACKEND=supabase`. No route, service,
repository, UI, authentication default, or API response was switched in Stage
3A.

## 2. Dual-backend direction

```text
HTTP route
    |
Domain service
    |
Explicit domain repository contract
    |
    +-- current synchronous SQLite repository
    |
    +-- future asynchronous PostgreSQL repository
            |
            +-- verified user transaction + RLS
            +-- narrowly scoped transactional RPC where appropriate
```

`defineRepositoryContract()` records the required methods for one domain and
validates an implementation. `invokeRepository()` is the incremental async
boundary: an awaited call works with both today's synchronous return value and
a future Promise. Existing services are intentionally not converted en masse.
Each domain stage will define its concrete contract as its PostgreSQL
repository is introduced.

This is not a generic ORM or competing repository hierarchy. Current
repository factories remain the SQLite implementations and retain their SQL.

## 3. Connection mechanism

Stage 3A selects a deliberate combination:

- Supabase JS remains responsible for Auth token verification, REST/RPC and
  server administration where already implemented.
- `pg` provides genuine PostgreSQL transactions for multi-statement domain
  workflows. Chained Supabase REST calls are never represented as a
  transaction.

The `pg` pool is lazy. Merely starting TeachersInn in SQLite mode does not
construct it or validate PostgreSQL credentials. A future domain repository
must explicitly construct `createPostgresConnection()`.

Pool defaults:

- maximum five connections;
- 10-second connection timeout;
- 30-second idle timeout;
- 15-second statement timeout;
- 5-second lock timeout;
- application name `teachersinn-repositories`;
- verified TLS for every non-local connection.

`close()` drains the pool once and permanently rejects later work. A future
Supabase runtime bootstrap must await it during `SIGINT`/`SIGTERM`. No pool is
currently attached to the application shutdown hook because no PostgreSQL
repository is active.

## 4. Verified TLS requirement

Remote direct connections require either:

- `SUPABASE_DB_CA_CERT`, containing the PEM certificate; or
- `SUPABASE_DB_CA_CERT_PATH`, pointing to the project CA certificate downloaded
  from Supabase Database Settings.

The certificate stays outside source control. `rejectUnauthorized` is always
true for remote hosts; there is no environment switch that silently disables
verification. Localhost may use an unencrypted local test connection. This
matches Supabase's documented `verify-full` direction.

The configured certificate is `prod-ca-2021.crt`, a valid CA PEM for the
Supabase Root 2021 CA, valid from 28 April 2021 through 26 April 2031. The `pg`
protocol connection completed against the configured
`aws-1-ap-southeast-2.pooler.supabase.com` endpoint with
`rejectUnauthorized: true`. No TLS bypass or fallback is available in the
connection implementation.

The read-only Management API reports that database SSL enforcement is currently
disabled for the development project. Stage 3A did not change it because doing
so reboots the database and was not authorized. The new client still always
requests verified TLS for remote connections; enabling server-side enforcement
should be a separately approved development-project hardening step before any
repository activation.

## 5. Transaction and RLS strategy

Every ordinary-user direct database operation uses
`withUserTransaction(identity, work, options)`:

1. Require a syntactically valid Supabase Auth UUID and explicit
   `verified: true` marker from the authoritative Auth boundary.
2. Check out one pool connection.
3. Begin a real PostgreSQL transaction at an approved isolation level.
4. Set statement and lock timeouts locally.
5. `SET LOCAL ROLE authenticated`.
6. Set transaction-local `request.jwt.claims`, `request.jwt.sub`, and
   `request.jwt.role` values.
7. Execute awaited parameterized work.
8. Commit on success, or roll back on any failure.
9. Always release the connection.

The local role and claims vanish at commit/rollback, preventing identity from
leaking through a reused pooled connection. The caller cannot request the
`postgres`, `service_role`, or `anon` database role through this API.

Legacy integer sessions are not accepted. The current Auth bridge must first
verify the access token and reconcile its UUID before a future PostgreSQL
repository can create this identity object. A UUID supplied by request JSON,
legacy user ID, client metadata, or an unverified JWT is insufficient.

Direct connections use a privileged database credential only to establish the
transaction and immediately assume `authenticated`. Ordinary repository work
therefore runs under RLS. Migration/maintenance privileges must use a separate
tooling path and must never reuse this request repository interface.

## 6. Scoped transaction API

The work callback receives only:

- `query(text, values)`;
- `many(text, values)`;
- `maybeOne(text, values)`;
- `one(text, values)`;
- `execute(text, values)`.

It does not receive the pool, credential, release method, or role-changing
operations. Parameter arrays are mandatory. Nested transactions and
fire-and-forget operations are not provided.

Supported isolation levels are `read committed`, `repeatable read`, and
`serializable`. Read-only transactions can be requested. Automatic retries are
not implemented: serialization and deadlock failures are marked retryable, but
each domain must establish transaction-level idempotency before opting into a
bounded retry policy.

## 7. Atomicity boundaries

Future PostgreSQL implementations require genuine transactions or narrowly
scoped, authorization-aware RPC functions for:

- enrollment plus notification/audit;
- lesson progress, course completion and unique certificate issuance;
- workshop capacity registration;
- attendance verification, CPD and notifications;
- unique job application plus audit;
- connections/messages and linked notifications;
- support/mentorship state transitions and notifications;
- account deletion and dependent records;
- administrator mutations and audit events.

Supabase JS calls issued separately are not atomic. Stage 3A does not implement
these production workflows prematurely.

## 8. Error mapping

PostgreSQL errors are converted to existing HTTP-safe behavior without SQL,
constraint names, credentials or connection strings:

| PostgreSQL condition | HTTP | Behavior |
|---|---:|---|
| `23505` unique violation | 409 | Existing-record conflict |
| `23503` foreign key | 409 | Related-record conflict |
| `23514`, invalid UUID/date | 400 | Invalid requested data |
| `42501`, PostgREST auth denial | 403 | Authorization denied |
| `40001` serialization | 409 | Marked retryable; no automatic retry |
| `40P01` deadlock | 409 | Marked retryable; no automatic retry |
| `57014` timeout | 503 | Marked retryable |
| SQLSTATE class `08`, socket timeout/reset | 503 | Temporary unavailability |

Unknown application errors retain the existing generic 500 response behavior.
SQLite busy/constraint handling remains unchanged.

## 9. Configuration

SQLite remains the code default. PostgreSQL configuration is validated only
when its connection foundation is deliberately constructed.

Required for future PostgreSQL repositories:

- `SUPABASE_DB_URL`;
- `SUPABASE_DB_CA_CERT_PATH` or `SUPABASE_DB_CA_CERT` outside localhost;
- a verified Supabase identity supplied by the Auth boundary.

Optional bounded pool settings are documented in `.env.example`:

- `POSTGRES_POOL_MAX`;
- `POSTGRES_CONNECT_TIMEOUT_MS`;
- `POSTGRES_IDLE_TIMEOUT_MS`;
- `POSTGRES_STATEMENT_TIMEOUT_MS`;
- `POSTGRES_LOCK_TIMEOUT_MS`.

The active `.env` was not edited. Full `DATA_BACKEND=supabase` startup remains
fail-closed because domain repositories are incomplete.

## 10. Domain migration plan

### Stage 3B — identity, profiles and settings

Current repositories: `auth.repository.js`, `profiles.repository.js`,
`settings.repository.js`, `activity.repository.js` for identity-linked audit.
Services: Auth, profiles and settings. Implement UUID-first profile/account
lookups, notification-preference upserts, exports and deletion. Keep Supabase
Auth administration separate from application data. Atomic boundaries include
profile/account initialization and account deletion. Tests must cover owner
scope, authoritative role/status, last-admin protection, suspension and mapping
failure. This stage depends on configured verified TLS and the existing Auth
UUID mapping/claim rules.

### Stage 3C — learning and certificates

Current repository: `learning.repository.js`, with course portions of
`admin.repository.js` and activity notifications/audit. Convert catalogue,
preview/enrolled access, enrollment, progress and certificate verification.
Completion and certificate issuance require one transaction or a secure RPC,
unique-code collision handling and concurrency tests. Verify archived-course
access, immutable curriculum, CPD totals and the narrow public certificate
function.

### Stage 3D — workshops and careers

Current repositories: `workshops.repository.js`, `careers.repository.js`, and
job portions of `admin.repository.js`. Workshop capacity registration,
attendance/CPD/audit/notification and job application/audit are transactional.
Tests need concurrent last-seat registration, verified attendance, reversal,
application uniqueness, cross-user privacy and admin aggregates.

### Stage 3E — networking, messaging, community and notifications

Current repositories: `messaging.repository.js`, `community.repository.js`,
`notifications.repository.js`, and `activity.repository.js`. Convert directory
visibility, symmetric connection state, message eligibility, post/reply
ownership and categorized notifications. Transaction tests must cover reverse
connection races, message/reply notification rollback, participant isolation
and read-state ownership.

### Stage 3F — plans, tutorials, mentorship, support and administration

Current repositories: `lesson-plans.repository.js`,
`tutorials.repository.js`, `mentorship.repository.js`,
`support.repository.js`, `dashboard.repository.js`, and the remainder of
`admin.repository.js`. Preserve duplicate semantics, mentorship transitions,
ticket privacy, linked notifications/audit and bounded administrator
aggregates. Avoid a single privileged catch-all repository.

### Stage 3G — full parity and security validation

Run all 98 routes against both providers with disposable identities and compare
status codes and response shapes. Add transaction rollback, serialization,
deadlock, pool exhaustion, graceful shutdown, stale connection, Auth refresh,
RLS A/B/admin, load and reconciliation tests. Only then may a later stage
consider enabling the backend switch.

## 11. Testing strategy and evidence

Local Stage 3A tests use a fake pool and verify:

- configuration validation and lazy construction;
- synchronous and asynchronous repository implementations;
- exact transaction ordering and transaction-local claims;
- commit, rollback, connection release and shutdown;
- invalid legacy/unverified identities rejected before connection use;
- safe error/status mapping and retry metadata.

The cloud test creates two disposable Auth identities, verifies
cross-user RLS through the direct connection, forces a rollback, verifies absence
with the service client, commits a preference row and cleans up. The final run
used pool size one so two different user identities necessarily reused the
same physical connection. Each saw only its own private preference row,
demonstrating that transaction-local role and claims do not leak.

Combined cloud validation: **15 passed, 0 failed, 1 skipped**. The only skipped
area is real email delivery, outside Stage 3A. Cleanup was verified afterward:
zero Auth users, Storage objects, profiles and notification preferences remain.

Final local suite: **162 passed, 0 failed, 0 skipped**. All 98 route contracts,
SQLite migration `0004`, integrity, foreign keys and the backup/restore
rehearsal pass. Syntax validation covered 90 project JavaScript files with zero
failures, and the dependency audit reports zero vulnerabilities.

## 12. Files introduced

- `src/data/repository-contract.js`
- `src/postgres/config.js`
- `src/postgres/connection.js`
- `src/postgres/errors.js`
- `src/postgres/index.js`
- `test/postgres-foundation.test.js`
- `integration-tests/postgres-foundation.js`

Modified configuration surfaces are `.env.example`, `package.json`,
`package-lock.json`, the test script and the central database error mapper. The
only new runtime dependency is `pg`.

## 13. Known limitations and Stage 3B prerequisites

- Obtain separate approval before enabling database SSL enforcement in the
  development project; it causes a database restart.
- Define the concrete Stage 3B profile/account repository contract.
- Convert only the Stage 3B services/routes to awaited repository calls.
- Establish shutdown wiring when the first PostgreSQL repository is activated.
- Do not use the direct pool with legacy identities or service-role shortcuts.
- Keep `DATA_BACKEND=supabase` disabled until every route dependency required
  by the chosen incremental runtime boundary exists.

No PostgreSQL domain repository is implemented in Stage 3A, by design.
