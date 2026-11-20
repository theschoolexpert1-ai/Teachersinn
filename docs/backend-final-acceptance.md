# TeachersInn backend final acceptance

## Decision

**Status: BACKEND DEVELOPMENT COMPLETE for the current single-instance,
SQLite and legacy-authentication scope.**

This is a development acceptance decision, not a production-readiness claim.
Production-like browser, accessibility, multi-instance, sustained load, soak,
disaster-recovery, and deployment verification remain outside the evidence in
this report. Supabase, Resend, authentication cutover, and deployment were not
used or changed.

Verification was performed on 2026-11-17 with Node.js v24.13.0. Every database
used by the acceptance commands was disposable. The configured application
database and `.env` were not read, migrated, or modified.

## Acceptance matrix

| Area | Status | Evidence | Limitation or follow-up |
|---|---|---|---|
| Architecture boundaries | Pass | One HTTP dispatcher; domain routes, services and repositories; shared SQLite adapter | Some stable coordination remains intentionally centralized |
| API compatibility | Pass | 94 unique ordered method/path entries match `test/fixtures/route-inventory.json` | Snapshot protects server contract, not undocumented client assumptions |
| Authentication lifecycle | Pass | Registration, login, cookies, sessions, expiry, revocation, password change and suspension tests | Active backend remains `legacy` by design |
| Authorization and isolation | Pass | User, mentor and administrator boundaries; owner-scoped profile, message, plan, ticket and account tests | No external penetration test was performed |
| Request validation | Pass | Malformed types, sizes, identifiers, pagination and structured integer coercion tests | Fuzzing was bounded to the automated suite |
| Error handling | Pass | Safe 400/401/403/404/409/429/500/503 mappings and generic database failures | Operational log aggregation was not exercised |
| Domain workflows | Pass | Learning, workshops, networking, messages, careers, communities, support, mentorship, settings, notifications, lesson plans and tutorials | Real third-party integrations are out of scope |
| Transactions and failure injection | Pass | Rollback tests cover linked writes, account deletion and notification/audit failures | Process-crash-at-instruction-boundary testing was not performed |
| Concurrency | Pass | Duplicate enrollments/applications, course completion, connections, workshop attendance/cancellation, support, mentorship, discussions, plans and tutorial toggles | SQLite remains a single-writer database |
| Database integrity | Pass | `integrity_check=ok`, foreign keys enabled, zero foreign-key violations | Verification used disposable databases |
| Migrations | Pass | Fresh database applied `0001`, `0002`, `0003`; checksums and schema valid; zero pending | No active database was migrated |
| Backup and restore | Pass | `node:sqlite` online backup restored 71 pages; integrity, foreign keys and migration history verified | Encrypted off-host backups and corrupted/interrupted restore drills are not verified |
| Dependency security | Pass | `npm audit --audit-level=high`: zero vulnerabilities | Audit is registry/advisory based, not a source-code security review |
| Syntax and regression suite | Pass | 76 JavaScript files parsed; 144/144 tests passed; zero failed, skipped or todo | Browser and screen-reader QA remain unverified |
| Startup and route protection | Pass | Isolated startup; `/` and `/app.js` 200, `/api/me` 200, protected user/admin routes 401 | HTTPS reverse-proxy behavior requires staging verification |
| Performance smoke | Pass | 160/160 localhost requests succeeded at concurrency 1, 5, 10 and 25 | Local timings are not capacity or production SLO evidence |

## Integration and compatibility evidence

The regression suite exercises complete HTTP workflows rather than only static
assertions. It covers account and session lifecycle; learning progress and
certificate issuance; workshop registration, cancellation and attendance;
connections and messaging; career applications; community posts and replies;
support and mentorship transitions; profile/privacy operations; lesson plans,
tutorials and notifications; and administrator actions. Service-level failure
injection verifies that associated audit, notification, session and domain
writes roll back together.

The ordered route inventory contains 94 unique method/path pairs: seven public
routes, 21 administrator routes, and the remaining routes protected by the
registry's user or mentor access levels. Duplicate registration fails at
startup. Public payload and centralized error contracts remain covered by the
same characterization suite used before modularization.

## Database, migration and recovery evidence

A newly created disposable database applied all three immutable migrations and
reported version `0003`, valid checksums, a valid schema, no pending migration,
`PRAGMA integrity_check` equal to `ok`, foreign keys enabled, and zero foreign
key violations. The disposable directory was deleted after verification.

The backup verification created and seeded a separate database, copied it with
the `node:sqlite` backup API, reopened the copy, and verified 71 pages, database
integrity, foreign keys, migration version `0003`, and representative record
counts. The project has no production restore orchestrator, so encrypted
off-host retention, interrupted restore recovery, corrupted-backup rejection,
and measured recovery objectives must be proven operationally before release.

## Performance evidence

The disposable localhost HTTP smoke benchmark completed all 40 requests at
each concurrency profile with no failures. Observed average/p95 latency in
milliseconds was 1.34/2.72 at concurrency 1, 3.69/5.62 at 5, 6.93/10.49 at 10,
and 18.80/25.04 at 25. The focused in-memory database benchmark confirmed that
the version-`0003` query indexes were selected for the audited access paths.
These figures compare local builds only and must not be used as production
capacity estimates.

## Accepted limitations and release gates

- SQLite requires durable local storage and supports one writer; shared-network
  storage and horizontally scaled writers are unsupported.
- Rate limiting is process-local and resets on process restart. Multi-instance
  enforcement would require shared state.
- Local smoke testing does not replace staging load, soak, browser,
  accessibility, reverse-proxy, TLS, monitoring, alerting, or incident drills.
- Backup tooling proves a local online copy and restore. Production release
  still requires encrypted off-host retention and a documented, timed restore
  rehearsal using the deployment platform.
- Deep offset pagination and the message inbox's temporary group/order work may
  require further measurement at operational data volumes.
- Supabase Auth, Resend email, data-backend switching and user migration are
  separate cutover activities and were deliberately not activated.

## Reproduction commands

```text
npm test
npm run verify:backup
npm run benchmark
npm run benchmark:db
npm audit --audit-level=high
```

Migration verification must target an explicitly named disposable database:

```text
node scripts/db.js migrate --db <disposable-database-path>
node scripts/db.js verify --db <disposable-database-path>
```

Do not point acceptance commands at an existing database unless it has first
been backed up and the migration is explicitly authorized.
