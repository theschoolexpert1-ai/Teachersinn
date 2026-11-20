# SQLite to Supabase PostgreSQL data migration plan

## Stage 3I tooling status

`scripts/migration/stage3i.js` now provides a read-only SQLite reader, strict private identity-manifest validation, data transformation, dependency planning, dry-run plans, transactional adapter boundaries, fingerprint checkpoints, resumability, and content-aware verification. `scripts/migration/dry-run.js` is the only CLI and refuses `--execute`; no cloud writer is shipped in Stage 3I. Synthetic tests cover all application domains plus duplicate identities, missing mappings, invalid roles/statuses/timestamps, dependency cycles, interruption, repeat execution, content mismatch, ownership, and redaction.

The complete field-level inventory is in `supabase-data-mapping-audit.md`; the future operational sequence and rollback gates are in `supabase-data-migration-runbook.md`. Real manifests and reports belong outside version control with restricted permissions.

The disposable cloud rehearsal is prepared in `scripts/migration/cloud-rehearsal.js` and documented in `supabase-cloud-migration-rehearsal.md`. It uses a fully synthetic SQLite database, a fresh Stage 3I-only mutation gate, captured Auth UUIDs, content/ownership verification, exact-key cleanup, and a final independent empty-project preflight. It has not been authorized or executed.

## Prerequisites

Freeze writes, take and verify a SQLite backup, take a Supabase database backup, synchronize migrations, reconcile every legacy user with a confirmed Supabase UUID, and obtain explicit production migration authorization. Never infer users by row order or display name.

## Mapping and order

1. Create/confirm Supabase Auth identities and populate `legacy_user_map` with normalized unique email, UUID, status, and evidence.
2. Migrate profiles and account settings using the identity map.
3. Migrate global catalogues: courses/lessons, workshops, communities, tutorials, and jobs.
4. Migrate owner/participant data: enrollments/progress, workshop registrations, connections/messages, posts/replies, tickets/replies, mentorships, tutorial views, lesson plans, career profiles, applications, preferences, notifications, and audit history.

Integer catalogue keys may be preserved with identity inserts followed by sequence reconciliation. Every user foreign key converts from SQLite integer ID to the mapped UUID. SQLite integer booleans become PostgreSQL booleans; empty optional dates become null; timestamps must parse as UTC; tutorial steps become JSON arrays; status values must pass target constraints. Certificate codes remain unique and immutable.

## Validation and conflicts

Before writing, fail on missing parents, duplicate normalized emails, duplicate certificate codes, invalid statuses, malformed timestamps/JSON, unmapped users, and target collisions. After each table, compare source/target counts, foreign-key coverage, selected aggregates, and deterministic checksums that exclude secrets. Never log password hashes, session tokens, private message bodies, or credentials.

The read-only validator is `scripts/validate-supabase-migration-readiness.js --db data/teachersinn.db`. It checks integrity, foreign keys, source counts, normalized-email duplicates, unsupported state values, and the number of identities requiring mapping. It performs no Supabase writes. The migration dry-run must use a separately verified snapshot rather than the active database.

## Rollback

Before cutover, rollback discards the disposable/import target and restores the verified SQLite backup. After cutover writes begin, a flag switch is insufficient: stop writes, export the PostgreSQL delta by mapped identity and timestamp, reconcile it into the chosen system, verify counts and constraints, invalidate sessions, and only then reopen traffic. Preserve both backups and migration manifests until formal acceptance.
