# Supabase Stage 3D: workshops, careers, and jobs

## Status and compatibility

Stage 3D adds independent async PostgreSQL repositories while SQLite and legacy Auth remain active.

| Domain | SQLite methods | PostgreSQL equivalent | Authorization / transaction |
| --- | --- | --- | --- |
| Workshops | `listForUser`, `find`, `registration`, `register`, `cancel` | `workshops`: `list`, `detail`, `register`, `cancel` | Verified owner; atomic capacity RPC |
| Attendance | `registrations`, `updateAttendance` | admin workshops: `registrations`, `attendance` | Database-authoritative admin; registration row lock |
| Workshop admin | `create`, `adminList`, `delete` | admin workshops: `create`, `list`, `remove` | `public.is_admin()` plus RLS |
| Workshop CPD | dashboard `workshopCpd` | `workshops.cpdSummary` | Derived only from verified `attended` records |
| Career profile | Stage 3B career profile methods | Reuse Stage 3B repository unchanged | Owner-only RLS |
| Jobs | `jobs`, `jobDetail`, `job` | `jobs`: `list`, `detail` | Open jobs for teachers; all jobs for admin |
| Applications | `application`, `apply`, `applications` | `jobs`: `apply`, `applications` | Owner UUID; unique constraint and transaction |
| Job admin | `createJob`, `closeJob`, `jobs` | admin jobs: `create`, `close`, `list` | Database-authoritative admin |

## Integrity and business rules

Migration `202611190005_workshops_jobs_security.sql` is applied. `register_for_workshop` locks the workshop row, checks start time and capacity, and idempotently returns an existing registration. This prevents concurrent overbooking. Cancellation retains existing behavior and removes the owner registration. Cloud validation exposed an ambiguous PL/pgSQL column reference in attendance verification; additive migration `202611190006_fix_workshop_attendance_ambiguity.sql` qualifies those references without changing the function contract or weakening permissions.

Attendance states remain exactly `pending`, `attended`, and `absent`. `set_workshop_attendance` requires `public.is_admin()`, a real registration, and an ended workshop. Repeated identical verification is idempotent. Teachers cannot set verification timestamps, verifier UUIDs, or attendance flags.

Workshop CPD remains derived, not materialized: only `attended` registrations with a verification timestamp count. Repeated verification cannot duplicate hours. Course CPD remains independent and unchanged; a future dashboard adapter sums the two derived totals.

Stage 3B career profiles are reused. No second career profile implementation exists. Jobs remain TeachersInn-local; no Schools, Vendors, cross-service database, or authentication integration is introduced.

The only application status supported by the existing schema is `applied`. Stage 3D does not invent review, shortlist, rejection, withdrawal, or acceptance states. Open jobs accept applications; closed jobs are hidden and reject new ones. `(user_id, job_id)` prevents duplicates under concurrency.

Administrator registration reports use a narrowly scoped security-definer function to return the existing name/email report only after authoritative admin verification. No Auth table privilege is granted.

## Validation boundary

Local contract tests cover owner binding, admin denial, capacity RPC use, verified-attendance CPD, duplicate applications, job closure, and migration safety. The project-specific `integration-tests/postgres-workshops-jobs.js` suite passed behind `RUN_STAGE3D_MUTATIONS=1` with three disposable identities, capacity concurrency, isolation, attendance, CPD, jobs, application concurrency, rollback, pool isolation, and captured-ID cleanup.

Migrations 005 and 006 are synchronized remotely. Independent post-test inventory confirmed zero Auth users, zero rows in every application table, zero Storage objects, four preserved buckets, and RLS enabled on every public application table.

## Stage 3E prerequisites and limitations

- Preserve the verified Stage 3D migration state and rerun cloud mutations only with fresh, project-specific authorization.
- Preserve notifications/audit side effects when async services are adapted.
- Job synchronization with the Schools application remains a future microservice integration.
- Auth reconciliation, data migration, and runtime activation remain out of scope.
