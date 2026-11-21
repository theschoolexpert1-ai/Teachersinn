# Supabase Migration Readiness Audit

Audit date: 19 November 2026  
Scope: Stage 1, read-only audit and planning  
Development project: `teachersinn-development` (`ivnmrhwxdawmzaakdhec`)  
Status: **AUDIT COMPLETE — BLOCKERS IDENTIFIED**

> **Stage 2 update — 19 November 2026:** The schema gaps identified below were
> corrected in forward-only migrations `202611190001` and `202611190002` and
> verified in the development project. PostgreSQL now has 26 RLS-enabled public
> tables and the missing course, attendance, career, application and preference
> structures. The repository, data-migration, Storage-adapter and Auth-cutover
> blockers remain; this audit's original gap descriptions are retained as the
> evidence that drove Stage 2. See `docs/supabase-schema-sync.md`.

## 1. Executive conclusion

TeachersInn is still a native Node.js application backed by synchronous
`node:sqlite` repositories and legacy password/session authentication. The
active defaults remain `DATA_BACKEND=sqlite` and `AUTH_BACKEND=legacy`. The
application exposes 98 ordered API contracts and the SQLite schema is at
migration `0004`.

A substantial Supabase foundation exists: three PostgreSQL migrations, 23
RLS-enabled public tables, 55 public-table policies, four Storage buckets with
15 object policies, a UUID-to-legacy-ID mapping table, server-only Supabase
clients, and an encrypted-cookie Auth bridge. The authenticated Management API
confirmed that the dedicated development project is active and healthy and
that all three local Supabase migration versions are recorded remotely.

It is not ready for activation. The PostgreSQL schema is behind the current
SQLite schema, every application data repository still uses SQLite, and the
identity/data migration workflow is not implemented. Career profiles, job
applications, notification preferences, verified workshop attendance, and the
complete course-management lifecycle are absent or incomplete in PostgreSQL.
The remote Auth redirect configuration also does not represent the intended
application origin.

No remote mutation, data import, authentication cutover, SMTP change, Storage
upload, deployment, or application-database write was performed in this audit.

## 2. Audit evidence and boundaries

Reviewed sources include `backend/src/server.js`, all route/service/repository modules,
SQLite migrations `0001`–`0004`, `backend/src/data/index.js`, the HTTP authentication
adapter and Supabase bridge, all three Supabase SQL migrations, Storage policy
SQL, environment templates, integration tests, and the 98-route fixture.

Read-only remote checks actually performed:

- Supabase Management API authentication and project listing.
- Remote migration-history listing.
- `information_schema`, PostgreSQL catalog, RLS-policy, trigger, function,
  index, and Storage-bucket metadata queries through the Management API.
- Non-secret Auth settings inspection.

The CLI schema-dump command could not run because that CLI operation requires
Docker. No Docker daemon or container was started. The comparison therefore
uses Management API catalog queries rather than a `pg_dump` artifact. Table,
column, index, RLS, function, trigger, bucket, migration-history, and selected
Auth metadata were still verified remotely. Full database grants and every
constraint definition were compared from the applied local migrations, not a
fresh remote dump.

## 3. Current application architecture

| Layer | Current implementation | Supabase readiness |
|---|---|---|
| HTTP | Native `node:http` dispatcher with modular route registration | Contracts can be retained |
| Domain | Services own transactions and business rules | Logic is reusable, but most methods assume synchronous repositories |
| Persistence | 14 SQLite repositories injected with `get`, `all`, `run`, and `tx` | No PostgreSQL repository implementation |
| Database switch | `backend/src/data/index.js` | `sqlite` works; `supabase` deliberately throws and fails closed |
| Authentication | Legacy scrypt hashes, SQLite sessions, sealed session cookie | Supabase bridge is feature-gated but incomplete for cutover |
| Frontend | Vanilla JavaScript SPA | API contracts can remain unchanged |
| File storage | No active upload/download API or UI | Supabase buckets/policies are prepared but not integrated |

Runtime dependencies are Node.js 22.13+, `@supabase/supabase-js` 2.119.0 and the
Supabase CLI 3.1.0 as a development dependency. SQLite uses the built-in
experimental `node:sqlite` module. There is no ORM, PostgreSQL driver,
multipart parser, or file-upload middleware.

The active `.env` contains Supabase development-test credentials but does not
set `DATA_BACKEND` or `AUTH_BACKEND`; code defaults therefore select SQLite and
legacy authentication. Secrets were neither printed nor copied into this
report.

## 4. SQLite schema inventory

The tracked SQLite application schema has 25 domain tables plus
`schema_migrations`:

| Domain | Tables |
|---|---|
| Identity/security | `users`, `sessions`, `audit_log` |
| Learning | `courses`, `lessons`, `enrollments`, `lesson_progress` |
| Workshops | `workshops`, `workshop_regs` |
| Network | `connections`, `messages`, `mentorships` |
| Community/support | `communities`, `posts`, `replies`, `tickets`, `ticket_replies` |
| Teaching tools | `tutorials`, `tutorial_views`, `lesson_plans` |
| Careers | `jobs`, `career_profiles`, `job_applications` |
| Activity/settings | `notifications`, `notification_preferences` |

Integer primary keys are used for application records and users. Relationships
use foreign keys with cascade or set-null behavior. Composite uniqueness
protects enrollment, lesson progress, workshop registration, tutorial state,
job applications, and connection pairs. Certificate codes and normalized
emails are unique.

Migration history:

- `0001_initial_schema`: complete original application schema.
- `0002_workshop_attendance_verification`: attendance state, verifier and
  verification timestamp.
- `0003_query_performance_indexes`: 17 access-pattern indexes.
- `0004_course_management`: course metadata, duration, lifecycle status,
  update timestamp, status index, and unique lesson position.

SQLite stores dates as ISO text or epoch integers, booleans as integers,
tutorial steps as JSON text, and IDs as integers. These require explicit and
validated conversion during import.

## 5. Prepared and remote PostgreSQL inventory

The three local migrations are:

1. `202611120001_initial_schema.sql`
2. `202611120002_rls_policies.sql`
3. `202611120003_storage.sql`

Remote migration history contains all three matching versions. The remote
project exposes these 23 application tables:

`account_settings`, `audit_log`, `communities`, `connections`, `courses`,
`enrollments`, `jobs`, `legacy_user_map`, `lesson_plans`, `lesson_progress`,
`lessons`, `mentorships`, `messages`, `notifications`, `posts`, `profiles`,
`replies`, `ticket_replies`, `tickets`, `tutorial_views`, `tutorials`,
`workshop_regs`, and `workshops`.

All 23 have RLS enabled. Remote metadata reports 55 public-table policies, 52
public indexes including primary/unique indexes, seven public functions, and
nine non-internal application triggers across `auth` and `public`.

The prepared design intentionally replaces `users` with Supabase `auth.users`
plus `profiles` and `account_settings`; `legacy_user_map` provides an auditable
integer-to-UUID bridge. SQLite `sessions` are intentionally replaced by
Supabase Auth sessions.

## 6. Schema comparison and gaps

### Critical gaps

| SQLite source of truth | PostgreSQL state | Impact |
|---|---|---|
| `career_profiles` | Missing | Career profile and CV APIs cannot migrate |
| `job_applications` | Missing | Applications and duplicate protection cannot migrate |
| `notification_preferences` | Missing | User notification settings cannot migrate |
| Course migration `0004` | Missing from `courses` | Admin course editor/lifecycle APIs cannot run |
| Workshop migration `0002` | Missing from `workshop_regs` | Verified attendance, audit and CPD rules cannot run |

Remote `courses` has only `id`, `title`, `category`, `level`, `summary`,
`instructor`, `cpd_hours`, `published`, and `created_at`. It lacks
`description`, `thumbnail`, `objectives`, `prerequisites`,
`estimated_minutes`, `status`, and `updated_at`.

Remote `workshop_regs` has only `user_id`, `workshop_id`, `registered_at`, and
`attended`. It lacks `attendance_status`, `attendance_verified_at`, and
`attendance_verified_by`.

### Constraint and semantic differences

- PostgreSQL correctly uses UUID user relationships and `timestamptz`, `date`,
  `boolean`, `inet`, identity `bigint`, and `jsonb` types.
- PostgreSQL adds useful bounds and checks absent from early SQLite tables,
  including positive durations/capacities, self-relationship prevention,
  message length, and array validation for tutorial steps.
- PostgreSQL enrollment requires a certificate whenever `completed_at` is set;
  the current SQLite schema does not encode that check in DDL, although the
  service performs issuance transactionally.
- PostgreSQL adds `updated_at` triggers to several tables whose SQLite source
  does not always have an update column. Migration code must define the desired
  canonical behavior rather than blindly copy fields.
- PostgreSQL's lesson uniqueness already matches the invariant introduced in
  SQLite `0004`.

### Index gaps

PostgreSQL contains broad equivalents for many `0003` access paths, but it is
not current. Missing or materially different coverage includes:

- course status/creation index from `0004`;
- workshop registration status index, because attendance status is absent;
- lesson-progress `(user_id, done_at desc)` access path;
- job-application indexes, because the table is absent;
- notification unread/read ordering equivalent to
  `(user_id, read_at, created_at desc, id desc)`;
- several PostgreSQL equivalents omit the SQLite tie-breaker `id desc`.

These differences need `EXPLAIN` validation against PostgreSQL queries; SQLite
index names and layouts should not be copied mechanically.

## 7. RLS and security readiness

The existing policy foundation is meaningful: ownership is enforced for
profiles, enrollments, progress, tickets, plans, tutorial state and
notifications; participant rules protect messages, connections and
mentorships; administrator checks read authoritative active account settings;
and table grants are narrowed after revoking implicit access.

Remaining security work:

- New career, job-application, notification-preference, workshop-attendance,
  and course-lifecycle fields require explicit RLS and column grants.
- Current course/lesson read policies allow published records or admins only.
  They do not preserve the current application rule that an enrolled teacher
  retains access after a course is unpublished or archived.
- Attendance verifier fields must be writable only by an active administrator;
  ordinary users must never self-award attendance or CPD.
- Course lifecycle changes and curriculum locking after enrollment must remain
  server-enforced even with RLS as a second boundary.
- Service-role clients bypass RLS. Their use must remain confined to audited
  server workflows and migration tooling.
- Public certificate verification is narrowly exposed through a security-
  definer function returning name, course, CPD hours and completion time. The
  Stage 2 contract must preserve opaque-code lookup and add only the current
  safe response decorations—never email or internal IDs.

Risk rating: **Critical** until the missing tables/policies exist and the full
cross-user/admin matrix passes against PostgreSQL.

## 8. Repository compatibility

All current repositories execute SQLite SQL through synchronous helpers. None
uses `createUserClient`, PostgreSQL SQL, PostgREST, or RPC calls. Consequently,
no data-bearing route is currently runnable with `DATA_BACKEND=supabase`.

Reusable components:

- route paths, access classifications and validation;
- most service-level business rules;
- API response shapes;
- HTTP error mapping, origin checks and CSRF enforcement;
- public certificate URL generation;
- Supabase client/config factories.

Required adapter work:

- define an asynchronous repository contract and transaction strategy;
- implement PostgreSQL/Supabase repositories for every domain;
- remove service assumptions that repository work is synchronous;
- replace SQLite transaction callbacks with PostgreSQL transactions or secure
  database functions for multi-write invariants;
- preserve conflict/idempotency behavior and error status mapping;
- keep the SQLite provider operational until reconciliation and rollback gates
  pass.

## 9. Authentication readiness

Implemented behind `AUTH_BACKEND=supabase`:

- signup and confirmed-email login;
- server-side `getUser` identity verification;
- encrypted AES-GCM HttpOnly `SameSite=Strict` session envelope;
- access-token refresh with refresh-lock deduplication;
- authoritative role/status lookup;
- immediate suspended-account rejection;
- legacy UUID mapping lookup;
- logout, password change, logout-other-sessions;
- recovery request, token-hash verification, recovery-only session, password
  reset and global revocation;
- generic recovery response to reduce account enumeration;
- existing CSRF and origin enforcement through the HTTP server.

Incomplete or blocked:

- no production-safe account migration/invitation/claim runner;
- no reconciliation report for duplicate/case-variant emails or unmapped users;
- legacy scrypt password hashes cannot be imported into Supabase Auth; users
  need an invitation/recovery/claim flow;
- a newly registered Supabase user has no claimed legacy mapping, so application
  data remains unavailable by design;
- no cutover/rollback session plan for invalidating legacy SQLite sessions;
- no final browser validation of confirmation/recovery redirects and cookies;
- email-template and real delivery validation is outside this audit;
- remote Site URL is `http://localhost:3000` and the redirect allow list is
  empty, so it is not ready for the canonical application origin.

The remote project has email enabled, confirmation required, and non-secret
metadata indicates Resend SMTP (`smtp.resend.com:465`) with the configured
TeachersInn sender. Credentials were not inspected or exposed. Delivery and
domain verification were not tested.

Risk rating: **High** until identity reconciliation, claim flow, redirect
configuration and full email/session validation pass.

## 10. Storage readiness

Remote bucket metadata matches the local migration:

| Bucket | Visibility | Limit | Intended access |
|---|---:|---:|---|
| `profile-photos` | Public | 5 MiB | Owner writes; public avatar reads |
| `professional-documents` | Private | 10 MiB | Owner-only CRUD |
| `course-resources` | Private | 25 MiB | Authenticated reads; admin writes |
| `community-attachments` | Private | 10 MiB | Authenticated reads; owner writes |

Extension/path checks and MIME allow lists exist, and remote metadata confirms
15 `storage.objects` policies. Integration tests cover ownership, cross-user
access, MIME/size limits and admin course-resource writes when explicitly
enabled.

The application itself has no Storage adapter, upload API, file-reference
model, signed-URL lifecycle, deletion workflow, or malware/content validation.
Course management currently stores a free-form `thumbnail` URL. PostgreSQL
does not yet have that column. Stage 2 must decide whether it stores a Storage
object path (preferred) or a validated external URL. A private
`course-resources` object cannot be used as a durable raw browser URL; it needs
authenticated download or short-lived signed URLs.

Risk rating: **High** for activation; the policies exist but application
integration does not.

## 11. API compatibility matrix

All 98 method/path/access contracts remain the required external contract. The
matrix groups routes by their shared implementation state.

| Route group | Count | Supabase-sensitive area | Current compatibility |
|---|---:|---|---|
| Auth and identity | 10 | Auth bridge, cookies, mapping, recovery | Partial; feature-gated bridge exists |
| Profile/settings/privacy | 5 | Profiles, account settings, preferences, deletion | Blocked by missing preferences and SQLite repositories |
| Dashboard/notifications | 5 | Cross-domain aggregates, notification state | Blocked by SQLite SQL and missing preferences |
| Courses/certificates | 6 | Enrollment, progress, issuance, public verify | Blocked by missing `0004` fields and repository |
| Workshops including admin | 9 | Registration, verified attendance, CPD | Blocked by missing `0002` fields/policies |
| Educator network/messages | 9 | Directory, connections, participant messaging | Schema/RLS foundation exists; repository absent |
| Community | 8 | Posts, replies, moderation | Schema/RLS foundation exists; repository absent |
| Support | 4 | Owner/admin tickets and replies | Schema/RLS foundation exists; repository absent |
| Mentorship | 4 | Participant lifecycle and transition trigger | Schema/RLS foundation exists; repository absent |
| Tutorials | 3 | JSON steps and owner saved state | Schema/RLS foundation exists; repository absent |
| Lesson plans | 7 | Owner CRUD/duplication | Schema/RLS foundation exists; repository absent |
| Careers/jobs/applications | 10 | Career profile, jobs, application uniqueness | Blocked by two missing tables |
| General administrator | 18 | Aggregates, roles, moderation, audit, courses | Blocked by repository and schema gaps |
| **Total** | **98** | 7 public, 66 user, 25 administrator | Contracts preserved; no data group is cutover-ready |

Authentication-sensitive routes are every `user` and `admin` route plus
`GET /api/me`. Administrator authorization must continue to come from
authoritative `account_settings`, never client metadata. The certificate route
is public but must stay limited to safe verification fields. There are no
active file-storage routes to migrate yet.

## 12. Data migration requirements

### Identity mapping

1. Normalize and reconcile SQLite emails without changing records.
2. Allocate or claim Supabase Auth UUIDs through an auditable process.
3. Insert one `legacy_user_map` row per eligible SQLite user and retain
   `profiles.legacy_id` for traceability.
4. Split each `users` row into Auth identity, profile and account settings.
5. Never infer UUID mappings from row order. Never import `password_hash` as a
   Supabase password.
6. Preserve administrator roles only through a reviewed server-side mapping;
   user metadata must not grant privileges.

### Dependency-safe import order

Suggested order: identities and mappings; account/profile/settings; courses and
lessons; enrollments and lesson progress; workshops and registrations;
communities/posts/replies; careers/jobs/applications; connections/messages;
mentorships; tutorials/views; plans; tickets/replies; notifications; audit log.

Explicit old-to-new maps are required for every integer identity referenced by
a UUID foreign key. Non-user bigint IDs may be preserved with identity values,
followed by sequence realignment above the imported maximum.

### Transformation rules

- Validate every timestamp and convert to UTC `timestamptz`; convert plan dates
  separately to `date`.
- Convert `0/1` booleans explicitly.
- Parse tutorial `steps` text as a JSON array; quarantine invalid rows.
- Preserve certificate codes byte-for-byte and verify uniqueness before load.
- Derive course status/description/duration exactly as SQLite migration `0004`
  did, while preserving already edited values.
- Translate workshop attendance state and verifier IDs through the UUID map.
- Preserve composite keys and relationship order; do not disable integrity
  permanently to force imports.
- Exclude SQLite session tokens and password hashes from application-data
  import; define separate Auth claim and session-revocation procedures.

Every import must be rerunnable or staged into empty tables, produce per-table
source/target counts and orphan/duplicate reports, and run inside controlled
transactions where feasible. Certificate samples, CPD totals and cross-domain
relationships need deterministic reconciliation checks.

## 13. Risk register

| Severity | Risk | Required mitigation |
|---|---|---|
| Critical | PostgreSQL schema omits current domains and migrations | Add reviewed forward-only migration and RLS/grants/tests |
| Critical | No PostgreSQL data adapter; `DATA_BACKEND=supabase` fails closed | Implement full repository provider before any activation |
| Critical | UUID identity mapping errors could reassign private data | Auditable map, duplicate checks, orphan checks, sampled reconciliation |
| Critical | Incomplete RLS could expose cross-user/admin data | Anonymous/A/B/admin matrix for every new and existing table |
| High | SQLite synchronous transaction semantics do not translate directly | PostgreSQL transactions/RPCs plus concurrency tests |
| High | Password hashes cannot move to Supabase Auth | Verified invitation/claim/recovery strategy and rollback plan |
| High | Course archive access differs from current RLS | Enrollment-aware course and lesson policies |
| High | Attendance can affect CPD/certification | Admin-only verification fields and atomic workflow |
| High | Storage exists without application authorization flow | Storage adapter, path model, signed URLs, cleanup and tests |
| High | Auth redirects target localhost | Exact staging/canonical allow list and template validation |
| Medium | Identity sequences may collide after preserved-ID import | Transactional sequence realignment and post-load insert test |
| Medium | Timestamp/boolean/JSON coercion can corrupt meaning | Strict transform validation and quarantine report |
| Medium | Public certificate enumeration/privacy | Retain opaque codes, narrow RPC fields, rate limiting |
| Medium | Dual-write/cutover divergence | Prefer maintenance-window snapshot and reconciliation over dual write |
| Low | CLI version is one patch behind | Upgrade only in a separately reviewed tooling change |

## 14. Recommended Stage 2 implementation order

1. **Freeze contracts and create gap migration.** Add a new PostgreSQL
   migration—never edit applied versions—for missing tables, course fields,
   attendance fields, constraints, indexes, triggers, grants and RLS.
2. **Extend cloud security tests.** Add new table/column assertions and full
   anonymous/teacher A/teacher B/admin tests, including archived enrolled-course
   access and attendance self-award denial.
3. **Define asynchronous repository interfaces.** Preserve current service/API
   shapes while making transaction boundaries explicit.
4. **Implement PostgreSQL repositories by domain.** Start with profiles and
   read-only catalogue; then learning, workshops, notifications/settings,
   community/network/support, careers/plans/tutorials, and admin aggregates.
5. **Implement secure database workflows.** Use PostgreSQL transactions or
   narrowly scoped RPC functions for completion/certificate issuance,
   attendance/CPD, account deletion and linked notification/audit writes.
6. **Build a dry-run migration tool.** Read SQLite from a snapshot, generate
   mappings/transforms, report conflicts, and write nothing by default.
7. **Build identity claim and reconciliation.** Resolve email conflicts,
   invitation/recovery behavior, admin approvals and unmapped-account handling.
8. **Add Storage integration only where required.** Decide path columns,
   authorization, signed URLs, replacement and cleanup semantics.
9. **Run disposable cloud imports.** Reconcile counts, constraints, sequences,
   certificates, CPD, permissions and all 98 APIs.
10. **Validate Auth/email/browser flows.** Configure exact non-production URLs,
    test real confirmation/recovery, refresh, suspension and revocation.
11. **Prepare cutover and rollback runbooks.** Include backup, maintenance
    window, final delta policy, validation gates and explicit approval.

Stage 2 should not switch `DATA_BACKEND` or `AUTH_BACKEND`; it should deliver
the missing schema, adapters, migration tooling and validation needed for a
later controlled cutover.

## 15. Stage 2 acceptance criteria

- A new forward-only migration makes PostgreSQL semantically equivalent to
  SQLite `0004`, including all 25 application domains or their intentional Auth
  equivalents.
- Every new table has reviewed constraints, grants, indexes and enabled RLS.
- Anonymous, teacher A, teacher B and administrator cloud tests pass without
  skipped security assertions.
- PostgreSQL repositories preserve all 98 API contracts and pass the existing
  regression suite plus parity tests.
- Multi-write workflows pass rollback, duplicate and concurrency tests.
- A read-only dry run reports zero unresolved identity, orphan, duplicate,
  invalid timestamp/JSON, certificate-code or sequence conflicts.
- Supabase Auth claim/mapping behavior is documented and tested without
  importing legacy password hashes.
- Storage paths and signed access are implemented only for approved features
  and pass ownership/size/type/deletion tests.
- Active SQLite/legacy behavior remains available and unchanged until an
  explicitly approved later cutover.
- No production action is implied by Stage 2 completion.

## 16. Final status

**AUDIT COMPLETE — BLOCKERS IDENTIFIED**

Remote read-only access was sufficient to verify project identity, migration
history, core schema metadata, RLS coverage, functions/triggers, buckets and
non-secret Auth settings. The development project is real and healthy, but the
prepared schema and application adapter are not current enough for migration or
activation.
