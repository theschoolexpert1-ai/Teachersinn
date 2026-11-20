# Supabase Stage 3C: learning repositories

## Scope and status

Stage 3C implements asynchronous PostgreSQL repositories for courses, lessons, enrollment, progress, course CPD, certificates, public verification, and administrator course management. They are exported by the PostgreSQL package but remain disconnected from the active SQLite/legacy-authentication runtime.

Local and cloud validation are complete. Project-specific authorization was granted for `teachersinn-development` (`ivnmrhwxdawmzaakdhec`) despite its CLI main-branch `production` classification. Migration `202611190004_learning_repository_security.sql` is applied and synchronized as the seventh migration. Certificate-verified TLS, RLS, functions, triggers, cleanup, and the four expected Storage buckets were independently verified after testing.

## Compatibility matrix

| Component | SQLite contract | PostgreSQL implementation | Authorization | Local coverage |
| --- | --- | --- | --- | --- |
| Courses | `learning.listCourses`, `findAccessibleCourse`; admin course methods | `learning.listCourses`, `courseDetail`; admin `listCourses`, `courseDetail`, `createCourse`, `updateCourse`, `setCourseStatus` | Published/enrolled/admin RLS; admin checked in DB | Catalogue identity, visibility SQL, admin denial and atomic creation |
| Lessons | `listCourseLessons`, `findLesson`; admin lesson replacement | `course_lesson_outline`; admin transactional creation/replacement | First published lesson preview; full enrolled/admin access | Locked body shape, ordering, admin transaction |
| Enrollments | `findEnrollment`, `enroll` | `enroll`, detail enrollment | Verified UUID; own insert/read; admin RLS | Parameter ownership and conflict-safe insertion |
| Progress | `markLessonComplete`, `countIncomplete` | `completeLesson` via `complete_course_lesson` | Enrolled owner only | Authoritative RPC contract and no direct completion update |
| Course CPD | Derived from completed enrollment | `cpdSummary` and certificate history | Owner RLS | Annual UTC bounds, derived totals |
| Certificates | Completion fields on enrollment | Atomic completion RPC, `listCertificates` | Owner list; database eligibility | Single database workflow, private-field checks |
| Public verification | `verifyCertificate` | anonymous `verify_certificate` call | Execute-only `anon`; no table grants | Anonymous transaction role and safe output |
| Admin learning | SQLite admin repository/service | `admin-learning.repository` | Authoritative `public.is_admin()` and RLS | Teacher denial, atomic course/curriculum operations |

The current HTTP catalogue is authenticated, not anonymous. Stage 3C preserves that observable route contract. “Public” in course visibility refers to published visibility among authenticated TeachersInn users; only certificate verification is anonymous.

## Course lifecycle

The existing statuses remain `draft`, `published`, and `archived`. Publishing requires at least one lesson. The existing publication-state trigger keeps `published` synchronized with `status`. Enrolled teachers retain access after archival; unenrolled teachers do not see draft or archived content. No new state or route is introduced.

## Lesson access and curriculum locking

`course_lesson_outline` returns the complete ordered outline required by the UI. An unenrolled teacher receives the first published lesson body as a preview and receives later lesson metadata with `body=null` and `locked=true`. Enrolled teachers and administrators receive the complete curriculum.

The Stage 2 curriculum trigger already rejects lesson changes after enrollment. Stage 3C replaces its body and adds an enrollment trigger so both workflows lock the same course row: curriculum changes take an exclusive lock and enrollment takes a shared lock. This closes the enrollment/curriculum race without weakening RLS. Conflicts map to a safe HTTP-compatible 409 database error.

## Enrollment, progress, and completion

Enrollment uses the verified transaction identity, checks published visibility, and inserts with the `(user_id, course_id)` primary key as the concurrency boundary. `ON CONFLICT DO NOTHING` makes retries idempotent without requiring owner update permission.

`complete_course_lesson` is a narrowly scoped security-definer function. It requires `auth.uid()`, finds the lesson server-side, locks the caller’s enrollment, inserts owner progress idempotently, counts authoritative curriculum rows, and issues a certificate only when no lessons remain. The function never accepts a target user, completion flag, CPD value, or certificate code from the client.

## CPD and certificates

Courses do not have a separate CPD ledger. Existing semantics derive course CPD from completed enrollments joined to the course’s immutable qualifying value. This naturally prevents duplicate awards because an enrollment is unique and can complete once. `cpdSummary` uses UTC calendar-year bounds and returns history for dashboard/reporting adapters.

Certificates remain completion fields on `enrollments`. Codes retain `TIN-` plus ten uppercase hexadecimal characters. Concurrent final-lesson calls serialize on the enrollment row; only the first completion receives a new code. Owner certificate lists remain private.

The existing `verify_certificate(text)` function remains the anonymous boundary. The repository sets PostgreSQL role `anon` inside a read-only transaction and returns only name, course title, CPD hours, completion time, and the caller-supplied verified code. It exposes neither email nor UUID and cannot mutate records. The canonical URL remains `https://teachersinn.schoolexpert.in/verify?code=...`.

## Administrator and transaction boundaries

Every admin repository method first executes `public.is_admin()`. Course and initial lessons commit in one transaction. Curriculum replacement deletes and recreates ordered lessons in one transaction and is also protected by the database trigger. Metadata and lifecycle changes use allowlists. Teachers cannot invoke these writes through RLS.

Repository operations use Stage 3A pooled transactions, safe error mapping, and transaction-local roles. Public verification uses the new anonymous transaction boundary. No service-role access is used for ordinary learning behavior.

## Migration and cloud validation

Applied migration `202611190004_learning_repository_security.sql` adds:

- safe learning aggregate and lesson-outline functions;
- atomic completion/certificate issuance;
- shared course-lock coordination for enrollment and curriculum changes; and
- execute-only grants to `authenticated`.

It does not drop objects, broaden anonymous table access, change existing data, or edit applied migrations. CLI dry run reports only this file.

`integration-tests/postgres-learning-repositories.js` passed behind both the general remote flags and `RUN_STAGE3C_MUTATIONS=1`. It validated three disposable identities, course lifecycle, preview/enrolled access, duplicate/concurrent enrollment, progress, concurrent certificate issuance, CPD, anonymous verification, administrator denial, curriculum locking, rollback, pool isolation, and captured-ID cleanup.

Independent postflight found zero Auth users, zero rows in all 26 application tables, zero Storage objects, four preserved buckets, 59 preserved RLS policies, no public table without RLS, four Stage 3C functions, two locking triggers, and all seven migrations synchronized. Stage 3B authorization was not reused.

## Remaining limitations and Stage 3D prerequisites

- Preserve the service-layer notification/audit integration when learning services are asynchronously adapted.
- Workshop CPD and workshop workflows remain Stage 3D scope.
- Account migration, Auth cutover, data migration, and PostgreSQL runtime activation remain out of scope.
