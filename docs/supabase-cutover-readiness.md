# TeachersInn Supabase cutover readiness

Stage 3J prepares the cutover but does not execute it. SQLite and legacy authentication remain active. No real identity, data, email, cloud object, policy, ACL, environment file, or runtime switch was changed.

## 1. Architecture and current status

The active application uses synchronous `node:sqlite`, four ordered SQLite migrations, repository/service/route modules, and 98 HTTP contracts. `backend/src/data/index.js` keeps SQLite as the active persistence provider. The PostgreSQL implementation is a parallel repository stack using transaction-local verified UUID identity and verified TLS. Thirteen Supabase SQL migrations define 26 application tables, RLS, policies, functions, triggers, Storage, and HTTP compatibility.

Legacy authentication stores parameterized scrypt password hashes. Sessions use 256-bit random bearer values with only SHA-256 hashes stored in SQLite, idle and absolute expiry, HttpOnly `SameSite=Strict` cookies, origin validation, and synchronizer CSRF tokens. Roles are `educator`, `mentor`, and `admin`; account status is `active` or `suspended`. Route authorization and PostgreSQL administrator checks are server-side. Client metadata is never authoritative for roles.

The Supabase bridge keeps access and refresh tokens in authenticated, encrypted HttpOnly cookies, refreshes server-side, validates the authoritative account row, rejects suspended accounts, and preserves CSRF/origin controls. Account deletion spans PostgreSQL preparation and Supabase Auth deletion and therefore needs failure-aware compensation and audit retention.

The Stage 3I rehearsal proved 26 ordered batches, 32 synthetic records, ownership, fingerprints, constraints, business rules, rollback, recovery, and zero-write repetition. Durable run `2026-11-20T09-39-09-303Z-6dcb589935c7` passed and left zero disposable records. This validates tooling, not real-data cutover readiness.

Storage has four preserved buckets. Before production cutover, separately inventory object ownership, privacy, MIME/size limits, application references, and backup/restore. Transactional email is required for activation, verification, recovery, and security notices but is intentionally not configured by Stage 3J.

## 2. Legacy account transition

The current SQLite inventory contains 12 identities, no duplicate normalized emails, and no authoritative email-verification evidence. Password hashes and sessions are non-portable and must never be copied to Supabase Auth.

For every identity, create a private, independently reviewed manifest entry containing the legacy integer ID, normalized email, approved Supabase UUID, approved role, suspension state, and approval reference. Enforce unique legacy IDs, UUIDs, and normalized emails. Resolve duplicate or disputed email ownership before any Auth creation. Administrator mappings require two-person review; user metadata or email naming cannot grant administrator access.

Create identities only in a separately authorized maintenance window. Preserve suspended users as suspended. Create the profile, account settings, notification preferences, consent evidence, and `legacy_user_map` entry under the reviewed UUID. Record explicit checkpoint states such as pending, invited, claimed, failed, or skipped.

Use a one-time, short-lived email verification plus password-activation/reset flow. Do not reveal account existence in recovery responses. Invalid, expired, and reused links must fail. On success, require a new password and a fresh Supabase session; invalidate all legacy sessions. If mailbox ownership is disputed, require an approved support verification process using non-public legacy evidence. Failed activation must be resumable without creating another UUID or changing role.

Supabase Auth operations and PostgreSQL transactions are not atomic together. Capture each created UUID immediately, checkpoint every outcome, and use scoped compensating cleanup only before the identity is claimed. Never automatically delete a claimed real identity.

## 3. Real-data migration readiness

The source and target each have 26 application/operational tables. `users` splits into Supabase Auth, `profiles`, `account_settings`, and `legacy_user_map`; `sessions` is discarded; SQLite `schema_migrations` is replaced by Supabase migration history. The approved dependency planner covers all 26 target batches and maps every ownership column through reviewed UUIDs.

Before using real data, compare the final snapshot with the synthetic fixture. Real data includes 12 users and materially larger seeded/application datasets; it may contain nulls, historical timestamps, deleted owners, retained audit data, certificate codes, and status combinations absent from the 32-record fixture. Run read-only compatibility, unique email, constraint, ownership, certificate, capacity, messaging eligibility, and business-rule checks against the final snapshot. Review every rejected row; never silently coerce or skip it.

Use fingerprints and counts per batch, identity/administrator/cross-user ownership checks, PostgreSQL foreign-key checks, domain business rules, transaction rollback, checkpoint recovery, and completed-run idempotency. Preserve certificate codes, audit retention, sequence safety, and Storage references. A count match alone is insufficient.

## 4. Controlled cutover sequence

1. Assign incident commander, database owner, Auth owner, email owner, verification reviewers, rollback authority, and acceptance authority. Approve the maintenance window and user communications.
2. Verify the exact production project, branch classification, health, verified TLS, 13 synchronized migrations, RLS/policies/triggers/function ACLs, capacity, backups, and expected target inventory.
3. Create and restore-test an encrypted source backup. Record hashes, custody, retention, and restoration instructions.
4. Put the application in enforced maintenance mode, stop workers, freeze all SQLite writes, and prove the freeze. Capture and hash the final SQLite snapshot.
5. Re-run integrity, foreign keys, compatibility, normalized-email, identity, ownership, and business-rule checks on that exact snapshot.
6. Approve the private identity manifest and administrator mappings. Verify SMTP domain, templates, redirect allow-list, delivery, confirmation, recovery, expiry, and replay rejection.
7. Create/checkpoint only approved Auth identities. Do not import password hashes or legacy sessions.
8. Import the final snapshot in the approved 26-batch order with constraints, triggers, and RLS intact. Verify every checkpoint before continuing.
9. Complete record counts, strict fingerprints, identity and ownership, foreign keys, business rules, certificates, audit records, Storage references, and zero-write idempotency.
10. In one controlled release, enable the reviewed PostgreSQL runtime and Supabase Auth configuration. Keep SQLite frozen and immutable.
11. Verify all 98 API contracts plus login, activation, recovery, logout, refresh, revocation, suspension, administrator denial, cross-user denial, deletion, and core application journeys.
12. Smoke-test health, dashboards, learning/certificates, workshops, careers, networking/messages, communities, support, mentorship, lesson plans, notifications, Storage, and email.
13. Monitor authentication errors, HTTP 5xx/4xx changes, database saturation, latency, RLS denials, email bounces, audit events, and support reports through the acceptance window.
14. At each decision point, either formally accept the verified state or invoke the applicable rollback procedure. Reopen traffic only after signed acceptance.

Separate explicit authorization is required for production/cloud access; final backup and write freeze; real Auth creation; activation emails; real-data import; any cleanup; SMTP or Auth dashboard changes; environment/runtime changes; deployment; maintenance-mode changes; and final acceptance or rollback. Stage 3J grants none of these.

## 5. Rollback and recovery

Before runtime activation and before any target-only write, stop the operation, preserve evidence, clean only captured unclaimed disposable/failed artifacts when explicitly approved, keep PostgreSQL closed, restore or retain the verified SQLite snapshot, restore the legacy deployment, invalidate newly issued sessions, verify the 98 contracts, and reopen only after acceptance.

For interruption, resume only from a verified checkpoint. For content, foreign-key, ownership, or business-rule failure, stop dependent batches and correct the plan offline; do not patch production data ad hoc. For partial identity creation, retain UUID checkpoints and decide explicitly between resume and scoped compensation. For email failure, do not activate Auth; retain legacy service. For startup failure, keep the write freeze while reverting the reviewed release.

Once any PostgreSQL-only production write occurs, flag reversal is unsafe. Stop all writes, snapshot both systems, extract the PostgreSQL delta by immutable key and mapped UUID, select one authoritative system, reconcile the delta through a reviewed procedure, verify fingerprints and ownership, invalidate sessions, and only then reopen. Never run SQLite and PostgreSQL as simultaneous writable authorities.

## 6. SMTP and activation prerequisites

Keep the provider configurable. Required settings are host, port/TLS mode, username, secret, verified sender/domain, sender name, and reply/support address; secrets stay outside source control. Configure Supabase Site URL and allow-listed confirmation/recovery destinations to the exact public origin. Templates must use short-lived token-hash verification, not access or refresh tokens in URLs.

Pass real-inbox tests for activation, verification, recovery, reset, invalid/expired/reused links, throttling, bounce handling, and security notifications. Confirm generic recovery responses and that logs contain neither credentials nor tokens. Provider choice, credentials, dashboard configuration, and email sending all require later approval.

## 7. Security requirements and remaining risks

- Keep database-owner and service-role credentials server-only and restricted to migration/administration. Runtime requests use verified user identity and RLS.
- Retain verified TLS; never use `rejectUnauthorized: false`.
- Revalidate all 60 policies, 26 RLS-enabled tables, function ACLs, administrator checks, cross-user denial, and account-deletion behavior immediately before release.
- Rotate production secrets before cutover and after any suspected exposure. Do not log connection strings, tokens, passwords, SMTP secrets, private manifest content, or user data.
- Preserve CSRF, origin checks, secure HttpOnly cookies, refresh serialization, suspension enforcement, audit logging, rate limits, and privilege separation.
- Treat Auth/database non-atomicity, mailbox ownership, administrator mapping, Storage ownership, post-activation rollback, email availability, and operational monitoring as acceptance risks with named owners.

## 8. Read-only validator

Run:

```text
npm run cutover:readiness
```

Optionally point it to a restore-tested snapshot with a process-local variable, without modifying `.env`:

```text
$env:CUTOVER_BACKUP_PATH = 'C:\secure\teachersinn-final.db'
npm run cutover:readiness
```

The program reads `CUTOVER_BACKUP_PATH` and `CUTOVER_IDENTITY_MANIFEST_PATH` only from the calling process, never writes them, and never prints their contents. It reports only `PASS`, `FAIL`, `BLOCKED`, or `NOT_CONFIGURED`. A safe legacy runtime can pass while cutover remains blocked. Deferred SMTP, identity review, runtime activation, and rollback acceptance never become implicit passes.

## 9. Cutover checklist and current blockers

- [x] SQLite integrity and foreign keys pass read-only validation.
- [x] Twelve identities inventoried; normalized-email duplicates are zero.
- [x] Stage 3I source compatibility and 26-table mapping pass.
- [x] Thirteen local migrations and 26 target tables match the validated baseline.
- [x] Latest durable cloud rehearsal proves project identity, verified TLS, and clean postflight.
- [ ] Select, hash, restore-test, and approve the final production backup.
- [ ] Build and independently approve the private 12-user identity manifest.
- [ ] Prove mailbox ownership and approve administrator/suspension handling.
- [ ] Select/configure SMTP and pass real activation/recovery tests.
- [ ] Complete production Storage inventory and restore test.
- [ ] Approve maintenance mode, write freeze, monitoring, rollback owners, and acceptance criteria.
- [ ] Grant separate authorizations for real identities, import, runtime configuration, and deployment.

Stage 3J therefore prepares a complete plan but does not declare the application ready to cut over. The recommended next activity is an authorization-free operational review of this plan, followed by a separately approved production-readiness stage that closes the backup, identity, SMTP, Storage, and rollback blockers. Actual migration and Auth activation remain later, independently authorized operations.
