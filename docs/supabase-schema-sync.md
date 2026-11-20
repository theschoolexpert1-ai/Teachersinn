# Supabase Stage 2 Schema Synchronization

Completion date: 19 November 2026  
Target: `teachersinn-development` (`ivnmrhwxdawmzaakdhec`)  
Runtime activation: **not performed**

## 1. Result

The development PostgreSQL schema is synchronized with SQLite migrations
`0001`–`0004` for the domains in Stage 2. Two forward-only migrations were
applied and remotely verified:

1. `202611190001_schema_sync_course_management.sql`
2. `202611190002_fix_course_rls_recursion.sql`

The second migration records a correction found by the real authenticated RLS
suite. The first implementation made the course policy query enrollments while
the enrollment policy queried courses, and PostgreSQL correctly rejected the
cycle. The applied migration was not edited; a new migration introduced a
narrow security-definer boolean predicate and the complete cloud suite then
passed.

No SQLite data was imported. `DATA_BACKEND` remains `sqlite` and
`AUTH_BACKEND` remains `legacy` by default. No SMTP, Auth configuration,
Storage object, UI, route, or deployment setting was changed.

## 2. Original PostgreSQL state

Before Stage 2, PostgreSQL contained 23 RLS-enabled public application tables,
55 public policies and the three migrations dated 12 November 2026. It lacked:

- `career_profiles`;
- `job_applications`;
- `notification_preferences`;
- workshop attendance status, verifier and verification time from SQLite
  `0002`;
- course metadata, duration, lifecycle status and update time from SQLite
  `0004`;
- enrollment-aware access for archived/unpublished courses;
- current course-status and workshop-attendance indexes.

The original project was verified empty before migration: zero Auth users,
Storage objects, profiles, courses, enrollments, workshop registrations and
audit rows.

## 3. Tables added

### `career_profiles`

Uses the profile UUID as its primary key and cascading foreign key. It contains
the current professional summary, institutions, responsibilities,
qualifications, certifications, training, skills, specializations, CV template
and update timestamp. The CV template is constrained to `classic` or `modern`.
An update trigger maintains `updated_at`.

RLS permits only the owning teacher to select or modify this private record.
Administrators do not receive CV-content access because the current application
does not require it.

### `job_applications`

Uses an identity bigint primary key, UUID profile relationship, bigint job
relationship, `applied` status constraint, timestamps and unique
`(user_id, job_id)` protection. User/date and job/user indexes cover current
queries. Teachers can insert and read only their own applications to open jobs;
active administrators can read applications for existing administrative
aggregates.

### `notification_preferences`

Uses the profile UUID as primary key and contains the seven current boolean
preference categories with `true` defaults. Owners alone can select, insert,
update or delete their preferences. An update trigger maintains `updated_at`.

## 4. Workshop attendance synchronization

`workshop_regs` now includes the exact SQLite `0002` concepts:

- `attendance_status`: `pending`, `attended`, or `absent`;
- `attendance_verified_at`: nullable `timestamptz`;
- `attendance_verified_by`: nullable administrator profile UUID with
  `ON DELETE SET NULL`.

Existing rows were deterministically backfilled from `attended`. A composite
workshop/status/user index and partial verifier index were added. Column grants
and the existing administrator-update RLS policy prevent ordinary teachers
from certifying attendance or awarding their own CPD.

## 5. Course-management synchronization

`courses` now adds:

- `description`;
- `thumbnail`;
- `objectives`;
- `prerequisites`;
- non-negative `estimated_minutes`;
- `status` constrained to `draft`, `published`, or `archived`;
- non-null `updated_at`.

Existing courses were backfilled exactly like SQLite `0004`: status derives
from `published`, description derives from summary, duration derives from the
lesson total, and update time derives from creation time. A trigger keeps the
legacy `published` boolean synchronized with lifecycle status. The status and
creation index supports discovery and administration.

A curriculum trigger rejects lesson insertion, update or deletion after the
first enrollment. Administrators must archive such a course instead of
invalidating progress, CPD history or certificates.

Course visibility now means:

- published courses are visible to authenticated teachers;
- drafts and archived courses are visible to active administrators;
- a teacher already enrolled in a draft/archived course retains access;
- unrelated teachers cannot see draft or archived courses;
- enrolled teachers and administrators can read the full curriculum;
- an unenrolled teacher sees only the first preview lesson of a published
  course.

The enrollment check is implemented by
`is_enrolled_in_course(bigint, uuid)`, a security-definer stable function with
an empty search path and only a boolean result. This avoids recursive RLS and
does not expose enrollment records.

## 6. Constraints, indexes, functions and policies

Post-migration remote inventory:

| Item | Verified value |
|---|---:|
| Public tables | 26 |
| Public tables with RLS | 26 |
| Public policies | 59 |
| Public indexes, including PK/unique | 62 |
| Public application functions | 10 |
| Course columns | 16 |
| Workshop-registration columns | 7 |

Foreign keys retain cascade/set-null behavior appropriate to the SQLite source.
Unique application protection covers job applications and lesson positions.
Check constraints cover lifecycle, attendance, application status, CV template
and non-negative duration.

The migration is additive. It contains no table/column drop, truncation, or row
deletion. Only the two affected course-read policies were transactionally
replaced. Existing applied migrations were not edited.

## 7. SQLite-to-PostgreSQL transformations for Stage 4

Stage 4 must explicitly transform rather than coerce:

- SQLite integer user IDs to mapped Supabase Auth UUIDs;
- integer booleans to PostgreSQL booleans;
- ISO text and epoch values to UTC `timestamptz`;
- lesson-plan dates to `date`;
- tutorial JSON text to validated `jsonb` arrays;
- administrator attendance verifier IDs through `legacy_user_map`;
- current course status, edited metadata and computed duration without
  overwriting newer values;
- identity bigint sequences above imported maxima.

Certificate codes must be preserved byte-for-byte. SQLite sessions and scrypt
password hashes must not be imported as Supabase sessions/passwords.

## 8. Remote safety and migration evidence

The authenticated account confirmed the intended project name and reference.
Remote history was inspected before the push. The project was empty and
dedicated to development. WAL-G was enabled, but no PITR or listed physical
backup was available. For this empty disposable target, recovery consists of
recreating the project and replaying the five source-controlled migrations.

The first migration dry run identified only `202611190001`, and the second dry
run identified only `202611190002`. Both were applied with the cloud workflow.
Remote catalog queries confirmed the resulting schema and that integration-test
cleanup returned Auth users, Storage objects and application-domain rows to
zero.

A migration-history request encountered one transient pooler timeout. A final
retry succeeded and records all five local/remote versions, including
`202611190001` and `202611190002`.

## 9. Security test results

The final cloud run used anonymous, Teacher A, Teacher B, a third unrelated
teacher, and administrator contexts—not only the service role.

Verified:

- cross-user career-profile reads and writes denied;
- cross-user job-application reads and impersonated inserts denied;
- administrator application read allowed;
- cross-user notification-preference reads and writes denied;
- teacher course-lifecycle writes denied;
- archived course hidden from unrelated teacher;
- archived course retained for the enrolled teacher;
- curriculum mutation after enrollment denied;
- teacher attendance certification denied;
- administrator attendance verification allowed;
- existing profile, enrollment, progress, messaging, support, mentorship,
  notification, certificate RPC and Storage isolation still pass.

Final remote suite: **14 passed, 0 failed, 1 skipped**. The skipped assertion is
real signup-email delivery, which is separately opt-in and outside Stage 2's
schema scope. Auth token, session, role, suspension and recovery tests ran; the
skip is not counted as schema/RLS success.

## 10. Local regression

- `npm test`: **155 passed, 0 failed, 0 skipped**.
- Route inventory: **98 unchanged**.
- JavaScript syntax: **83 files, zero failures**.
- SQLite migration verification: current `0004`, checksums/schema valid,
  integrity `ok`, zero foreign-key violations.
- Backup/restore rehearsal: passed; 73 pages, four migrations, integrity `ok`.
- Active `.env`: unchanged.
- Active SQLite file size and modification time: unchanged during Stage 2.

## 11. Remaining blockers and Stage 3 requirements

Schema synchronization does not make Supabase an application backend. Stage 3
must:

1. define asynchronous repository interfaces without changing the 98 API
   contracts;
2. implement PostgreSQL repositories for every domain;
3. replace synchronous SQLite callback transactions with PostgreSQL
   transactions or narrowly scoped RPC workflows;
4. preserve idempotency, conflict handling, course completion/certificate,
   attendance/CPD, notifications and audit atomicity;
5. add repository parity, rollback and concurrency tests;
6. create a read-only-by-default SQLite migration/reconciliation tool;
7. retain SQLite and legacy Auth as the active backends throughout Stage 3;
8. defer Storage integration and Auth cutover to their separately approved
   stages.

Stage 2 status: **COMPLETE FOR THE DEVELOPMENT SCHEMA**. Application migration
and cutover are not authorized or complete.
