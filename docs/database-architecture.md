# TeachersInn SQLite database architecture

## Overview

TeachersInn uses one SQLite database in WAL mode through Node's built-in
`node:sqlite` driver. `TEACHERSINN_DATA_DIR` selects the private persistent
directory; the database filename is `teachersinn.db`. Foreign keys are enabled
on every application connection and the busy timeout is 5 seconds.

The current schema contains **25 application tables** plus the
`schema_migrations` governance table. There are no persistent views or
triggers. Twenty-two named application indexes supplement primary-key and
unique auto-indexes after migration `0003`.
Supabase SQL files describe an inactive future PostgreSQL path and are not part
of this SQLite schema lifecycle.

## Table inventory

### Identity, authentication, and administration

| Table | Purpose and ownership | Primary/unique keys | Relationships and indexes |
|---|---|---|---|
| `users` | Account, professional profile, consent, role and status; self-owned with administrator controls | PK `id`; unique case-insensitive `email` | Parent of most user records; role/status CHECK constraints |
| `sessions` | Hashed legacy login sessions; user-private | PK `token_hash` | `user_id → users` CASCADE; `idx_sessions_user` |
| `audit_log` | Security and administrative history | PK `id` | `user_id` intentionally has no FK so audit evidence can survive account deletion; `idx_audit_created` |
| `schema_migrations` | Applied SQLite migration versions and immutable checksums | PK `version` | Governance metadata, not application/user data |

### Courses and learning

| Table | Purpose and ownership | Primary/unique keys | Relationships and indexes |
|---|---|---|---|
| `courses` | Published learning catalogue | PK `id` | Platform-managed |
| `lessons` | Ordered course content | PK `id` | `course_id → courses` CASCADE |
| `enrollments` | Per-user course enrollment, completion and certificate | PK `(user_id,course_id)`; unique `certificate_code` | User and course CASCADE |
| `lesson_progress` | Completed lessons | PK `(user_id,lesson_id)` | User and lesson CASCADE |
| `tutorials` | Tutorial catalogue | PK `id` | Platform-managed |
| `tutorial_views` | Saved/viewed tutorial state | PK `(user_id,tutorial_id)` | User and tutorial CASCADE |

### Workshops

| Table | Purpose and ownership | Primary/unique keys | Relationships and indexes |
|---|---|---|---|
| `workshops` | Event catalogue and CPD values | PK `id` | `created_by → users` SET NULL; constrained mode |
| `workshop_regs` | User registration and administrator-verified attendance | PK `(user_id,workshop_id)` | User/workshop CASCADE; verifier → users SET NULL; constrained attendance state |

The legacy `attended` integer remains for compatibility. Migration `0002`
adds `attendance_status`, `attendance_verified_at`, and
`attendance_verified_by` and maps prior attended records to `attended`.

### Educator network and messaging

| Table | Purpose and ownership | Primary/unique keys | Relationships and indexes |
|---|---|---|---|
| `connections` | Directed connection requests and accepted relationships | PK `id`; unique `(requester_id,addressee_id)` | Both users CASCADE; constrained status |
| `messages` | Private educator messages | PK `id` | Sender/recipient CASCADE; `idx_messages_pair` |

### Community

| Table | Purpose and ownership | Primary/unique keys | Relationships and indexes |
|---|---|---|---|
| `communities` | Discussion categories | PK `id`; unique `name` | Platform-managed |
| `posts` | User discussions | PK `id` | Community and author CASCADE |
| `replies` | User discussion replies | PK `id` | Post and author CASCADE |

### Careers and planning

| Table | Purpose and ownership | Primary/unique keys | Relationships and indexes |
|---|---|---|---|
| `lesson_plans` | Private teaching plans | PK `id` | `user_id → users` CASCADE |
| `jobs` | Administrator-managed vacancies | PK `id` | `posted_by → users` SET NULL; constrained status |
| `career_profiles` | Private CV-builder content | PK/FK `user_id` | User CASCADE; constrained template |
| `job_applications` | Private application history | PK `id`; unique `(user_id,job_id)` | User/job CASCADE; `idx_job_applications_user` |

### Support, mentorship, and notifications

| Table | Purpose and ownership | Primary/unique keys | Relationships and indexes |
|---|---|---|---|
| `tickets` | User-owned support cases | PK `id` | User CASCADE; constrained status and priority |
| `ticket_replies` | Support conversation entries | PK `id` | Ticket CASCADE; author SET NULL |
| `mentorships` | Mentee/mentor relationships | PK `id` | Both users CASCADE; constrained lifecycle |
| `notifications` | Private activity history and read state | PK `id` | User CASCADE; `idx_notifications_user_read_created` |
| `notification_preferences` | Per-user optional notification categories | PK/FK `user_id` | User CASCADE; each preference constrained to 0/1 |

## Relationship and integrity strategy

- Owner records generally use `ON DELETE CASCADE`, removing private dependent
  data when an account is deleted.
- Authorship that must remain meaningful after account deletion uses `SET NULL`.
- Audit user IDs deliberately remain nullable and unconstrained for retention.
- Composite primary keys prevent duplicate enrollments, lesson progress,
  workshop registrations, tutorial state, and preference rows.
- Unique constraints prevent duplicate emails, certificate codes, community
  names, connection direction, and job applications.
- CHECK constraints protect roles, account/workflow states, event modes,
  templates, and boolean notification values.
- All application SQL uses prepared statements. Multi-write business operations
  use the synchronous `tx()` helper and roll back on exceptions.

## Initialization lifecycle

1. Create the configured private data directory if necessary.
2. Open SQLite and set `busy_timeout`, WAL, and foreign-key enforcement.
3. Acquire a SQLite `BEGIN IMMEDIATE` migration lock.
4. Validate definitions, migration history, checksums, and current schema.
5. Adopt one recognized untracked schema or apply pending migrations.
6. Validate the final schema and commit.
7. Only then expose query helpers and run `seedIfEmpty()` from the server.

Initialization errors close the connection and fail application startup. The
system never resets, rebuilds, or automatically repairs unknown drift.

## WAL, transactions, and concurrency

WAL permits concurrent readers and one writer. Migrations use `BEGIN IMMEDIATE`
so only one initializer can modify schema/history. A second initializer waits
up to the busy timeout and then validates the first initializer's committed
state. Migrations and their history insert share one transaction.

This remains a single-host, single-database design. Multiple application
replicas sharing SQLite over a network filesystem are unsupported.

Business transactions are deliberately short and contain no network calls.
SQLite busy/locked failures return a retryable HTTP 503 with a one-second
`Retry-After`; constraint failures return HTTP 409. SQL details are logged
server-side but are not exposed to clients. Automatic write retries are not
used because blind retry of non-idempotent requests can duplicate effects.

## Backup and limitations

Use `npm run verify:backup` to rehearse the Node SQLite backup API against a
disposable migrated database. It verifies integrity, foreign keys, records,
relationships, and migration history after restore. Production backups still
require encrypted storage, retention controls, monitoring, and independent
restore rehearsals.

SQLite migrations are forward-only. Destructive changes, table rebuilds, or
data transformations need an explicit backup, separate review, rehearsed
recovery plan, and a new migration. Do not rewrite historical migrations.
