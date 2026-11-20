# Stage 3I SQLite-to-PostgreSQL data mapping audit

## Inventory and identity boundary

The tracked SQLite database has 26 application/operational tables and passes integrity and foreign-key checks. The target has 26 public application tables. Twenty-four source tables carry migratable application data; `sessions` is deliberately discarded and `schema_migrations` is replaced by Supabase migration history. `users` is a split mapping: an independently created and verified Supabase Auth identity owns `profiles`, `account_settings`, and `legacy_user_map`.

The read-only inventory found 12 legacy users, zero duplicate normalized emails, zero unsupported status groups, and zero orphaned foreign keys. Reports expose counts only. Password hashes, session tokens, emails, messages, and other private values are not exported.

## Complete mapping

All integer catalogue/content keys are preserved during the future import and their PostgreSQL identity sequences must then be advanced. Every legacy user foreign key is replaced through the approved manifest; never through row order, display name, or a client-supplied UUID.

| SQLite source | PostgreSQL target | Key and ownership | Transform / validation | Order and rollback implication |
| --- | --- | --- | --- | --- |
| `users` | Supabase Auth + `profiles`, `account_settings`, `legacy_user_map` | integer `id` becomes verified Auth UUID; `legacy_id` retained | normalize email; integer booleans; split role/status/consent; omit password hash and lock counters | Auth reconciliation first; Auth rollback is not transactionally coupled to SQL |
| `sessions` | none | token hash owns legacy session | never migrate tokens, CSRF values, IPs, or agents | invalidate at cutover |
| `schema_migrations` | none | SQLite version | target uses `supabase_migrations.schema_migrations` | never copy or repair automatically |
| `audit_log` | `audit_log` | bigint `id`; nullable user maps to UUID; retain `legacy_user_id` | text timestamp to `timestamptz`; IP to `inet`; retained records need explicit policy | after identities; retained audit needs separate cleanup/recovery handling |
| `courses` | `courses` | bigint `id` | integer boolean; status/CPD/duration checks; timestamps | before lessons/enrollments; reconcile sequence |
| `lessons` | `lessons` | bigint `id`; `course_id` FK | positive position/minutes; unique course-position | after courses; cascades with course rollback |
| `enrollments` | `enrollments` | composite UUID + course | timestamps; certificate code unique; completion requires code | after profiles/courses; verify CPD and certificates |
| `lesson_progress` | `lesson_progress` | composite UUID + lesson | timestamp; owner mapping | after profiles/lessons |
| `workshops` | `workshops` | bigint `id`; creator UUID | mode/capacity/CPD checks; timestamp | after profiles; before registrations |
| `workshop_regs` | `workshop_regs` | composite UUID + workshop | booleans; attendance status/verifier UUID/timestamps | after profiles/workshops; verify no duplicate CPD |
| `connections` | `connections` | bigint `id`; two UUID owners | status check; participants must differ | after profiles; before messages where eligibility matters |
| `messages` | `messages` | bigint `id`; sender/recipient UUIDs | participants differ; bounded body; timestamps | after profiles/connections; private content excluded from logs |
| `communities` | `communities` | bigint `id`; unique name | preserve text/icon | before posts |
| `posts` | `posts` | bigint `id`; community + UUID owner | add target update timestamp | after communities/profiles; before replies |
| `replies` | `replies` | bigint `id`; post + UUID owner | add target update timestamp | after posts/profiles |
| `tickets` | `tickets` | bigint `id`; UUID owner | status/priority checks; timestamps | after profiles; before replies |
| `ticket_replies` | `ticket_replies` | bigint `id`; ticket; nullable UUID author | nullable deleted author preserved | after tickets/profiles |
| `mentorships` | `mentorships` | bigint `id`; mentee/mentor UUIDs | status; participants differ; add update timestamp | after profiles; verify lifecycle |
| `tutorials` | `tutorials` | bigint `id` | JSON text `steps` to JSONB array; positive minutes | before tutorial views |
| `tutorial_views` | `tutorial_views` | composite UUID + tutorial | integer boolean; timestamp | after profiles/tutorials |
| `lesson_plans` | `lesson_plans` | bigint `id`; UUID owner | empty date to null; date/timestamp and duration checks | after profiles; private ownership verification required |
| `jobs` | `jobs` | bigint `id`; nullable poster UUID | status/job type; timestamp | after profiles; before applications |
| `career_profiles` | `career_profiles` | UUID owner PK | template allowlist; timestamp | after profiles |
| `job_applications` | `job_applications` | bigint `id`; unique UUID + job | fixed `applied` status; timestamps | after profiles/jobs |
| `notifications` | `notifications` | bigint `id`; UUID owner | timestamps; private text not logged | after profiles and generating domain records |
| `notification_preferences` | `notification_preferences` | UUID owner PK | seven integer booleans; timestamp | after profiles |

## Structural differences and gaps

- SQLite `users.password_hash`, lock counters, and legacy sessions have no target application-table equivalent and must not be copied.
- Target `legacy_user_map` and `account_settings` have no independent source table; both derive from a reviewed identity decision and `users`.
- PostgreSQL adds UUID ownership, `timestamptz`, JSONB tutorial steps, stricter checks, update timestamps, RLS, and database-owned workflow functions.
- SQLite has no verified-email field. Email normalization can detect conflicts but cannot prove ownership.
- No current SQLite columns contain Storage paths. Future file inventory must still reconcile any external/manual assets before cutover.
- Certificate codes are preserved exactly and verified for uniqueness and their enrollment/completion relationship.

Rollback before cutover discards the authorized target import and retains the verified SQLite snapshot. Once PostgreSQL accepts new writes, rollback requires a delta reconciliation; switching a backend flag would lose or split data.
