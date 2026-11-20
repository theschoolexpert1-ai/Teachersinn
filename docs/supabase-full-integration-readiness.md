# Supabase full integration readiness

> Stage 3I local preparation adds a read-only source inventory, deterministic identity-manifest contract, dry-run migration planner/transformer, checkpoint/idempotency boundary, content-aware verifier, synthetic rehearsal, Auth transition design, and future cutover runbook. It performs no cloud mutation or runtime activation.

> Stage 3I continuation: a complete synthetic SQLite fixture, three-identity manifest, and disabled cloud rehearsal harness are prepared. Local/mock validation is distinct from a real PostgreSQL rehearsal. Fresh mutation authorization and a decision on narrowly scoped migration privileges remain required.

> Stage 3H complete: 13 migrations are synchronized. `prepare_own_account_deletion(inet)` remains SECURITY DEFINER with an empty search path and is executable only by `postgres` and `authenticated`; `anon`, `service_role`, and `PUBLIC` are denied. The project-specific cloud HTTP suite passed all 98 contracts.

## Architecture matrix

| Component | Current dependency | PostgreSQL equivalent | Integration status |
| --- | --- | --- | --- |
| HTTP routes | 15 synchronous-service modules | Isolated async facade and loopback harness | 98/98 audited and cloud validated |
| Profiles/settings | SQLite repositories | user/career/preferences repositories | Repository and cloud validated |
| Learning/certificates | SQLite learning/admin services | learning/admin-learning repositories | Repository and cross-domain suite prepared |
| Workshops | SQLite workshop service | workshop/admin repositories | Validated |
| Jobs/career | SQLite career/admin services | career/jobs/admin-jobs | Validated |
| Network/messages | SQLite messaging service | discovery/connections/messaging | Validated |
| Community/notifications | SQLite services | community/moderation/notifications | Validated |
| Mentorship/support | SQLite services | mentorship/support | Validated |
| Tutorials/plans/dashboard | SQLite services | tutorials/lesson-plans/dashboard | Validated |
| Authentication | Legacy sessions/numeric IDs | Supabase Auth bridge/UUID identity | Not activated; reconciliation required |

The server already awaits every route handler. Stage 3H adds request-scoped verified UUID propagation, an asynchronous PostgreSQL HTTP facade, and a loopback-only harness. Current route registration still mixes bigint resource identifiers with legacy numeric user identifiers, so the isolated composition requires a dual bigint/UUID validator. `src/postgres/integration.js` remains fail-closed and is not wired into `server.js`.

## API and service compatibility

All 98 route method/path/access contracts remain unchanged. Repository response contracts and domain cloud suites are validated. HTTP-level PostgreSQL compatibility remains intentionally unactivated because authoritative UUID identity must replace legacy numeric route arguments first. The future adapter must derive identity from `session.identity.authUser.id`, never request data.

## Cross-domain and transaction status

Domain suites validate account initialization, learning/certificates, workshop CPD, networking/messages, community notifications, mentorship, support, careers/jobs, tutorials, plans, dashboards, rollback, concurrency, and pool identity isolation. On 2026-11-19, the project-scoped Stage 3H HTTP suite passed all 98 contracts against `teachersinn-development` (`ivnmrhwxdawmzaakdhec`). Independent post-test verification confirmed zero Auth users, zero rows in all 26 application tables, zero Storage objects, four preserved buckets, 13 synchronized migrations, RLS on every public application table, and 60 preserved policies.

Database-owned RPCs preserve atomic notification, audit, completion, capacity, attendance, relationship, and support workflows. SECURITY DEFINER functions have empty search paths and restricted execution. RLS remains the second authorization boundary.

## Remaining blockers

- Real identities have not been reconciled or migrated.
- Supabase Auth and PostgreSQL runtime are not active.
- Real data has not been migrated.
- The private identity manifest, mailbox ownership decisions, administrator review, email activation readiness, and Storage inventory require future operational approval.
- A narrowly privileged cloud executor and real cloud rehearsal require separate mutation authorization; Stage 3I intentionally ships only a refusing dry-run CLI.
- Production backup, deployment, and rollback rehearsals remain future authorized work.

Stage 3I local preparation means the migration can be reviewed and rehearsed synthetically; it is not proof of a cloud or real-data migration and is not cutover approval.
