# TeachersInn SQLite migration guide

## Migration model

Migration modules live in `backend/src/migrations/` and use four-digit monotonically
increasing versions. The current immutable sequence is:

| Version | Name | Purpose |
|---|---|---|
| `0001` | `initial_schema` | Creates the 25-table legacy-compatible baseline and five indexes |
| `0002` | `workshop_attendance_verification` | Adds verified attendance state and backfills the legacy flag |
| `0003` | `query_performance_indexes` | Adds seventeen evidence-based indexes for high-volume access paths |

`schema_migrations` stores `version`, `name`, SHA-256 `checksum`, and
`applied_at`. The checksum covers the version, name, and normalized line endings
of the actual SQL. Changing an applied file causes startup and migration to fail.

## Startup and baseline adoption

Startup automatically runs the same fail-closed migration runner used by the
explicit command. This is compatible with the existing application lifecycle
and ensures no backend query runs against an older schema.

An untracked database is adopted only when complete structural metadata matches
one recognized state:

- current schema: record `0001`, `0002`, and `0003` without replaying SQL;
- pre-index current schema: record `0001` and `0002`, then apply `0003`;
- legacy pre-attendance schema: record `0001`, then transactionally apply
  `0002` and `0003`;
- empty database: apply all migrations normally.

Matching covers the exact application table set, column definitions, primary
keys, foreign keys, unique/index structure, named indexes, and critical CHECK
constraints. Unknown, partial, or drifted schemas fail without recording a
baseline. Existing rows are never rewritten except the documented attendance
backfill in `0002`. Migration `0003` changes only indexes and does not rewrite
application rows.

## Commands

All commands require an explicit database path and print schema metadata only,
never user records.

```powershell
npm run db:status -- --db C:\path\to\teachersinn.db
npm run db:verify -- --db C:\path\to\teachersinn.db
npm run db:migrate -- --db C:\path\to\teachersinn.db --confirm-existing
```

`db:status` is read-only and reports compatibility, applied/pending versions,
checksums, and drift. `db:verify` is read-only and additionally runs integrity
and foreign-key checks; an untracked database is not considered verified even
when its schema is recognizable. Neither command creates migration history.

`db:migrate` creates a new explicitly named database, but refuses an existing
file unless `--confirm-existing` is supplied. Back up and run `db:verify`
before approving an existing target. These safeguards do not replace change
review or backup policy.

Do not run these commands against the existing application database during
development unless the database owner explicitly approves the exact target.

## Authoring a migration

1. Copy the module shape used by `0002_workshop_attendance.js`.
2. Choose the next unused four-digit version and a descriptive immutable name.
3. Use deterministic SQL. Do not include seed or environment-specific data.
4. Prefer additive SQLite changes. Confirm every statement is supported inside
   a transaction on the minimum Node/SQLite runtime.
5. Add the module to the ordered array in `backend/src/migrations/index.js`.
6. Extend schema compatibility checks for new critical constraints.
7. Add tests for fresh application, upgrade from the preceding version,
   rollback, repeated execution, drift, and backup restoration.
8. Run `npm test`, `npm run verify:backup`, and read-only verification against
   a disposable restored copy.

Once any environment has applied a migration, never edit its version, name, or
SQL. Correct mistakes with a new migration. Duplicate or out-of-order versions
are rejected before database changes begin.

## Atomicity and rollback

The runner obtains `BEGIN IMMEDIATE`, executes pending SQL, inserts its history
row, validates the final schema, and commits. Any error rolls back both schema
and history. It never marks a failed migration successful or automatically
deletes/rebuilds a database.

SQLite does not make every future schema design easily reversible. Production
rollback normally means stopping writes, restoring a verified pre-change
backup, and deploying compatible application code. Destructive migrations and
table rebuilds require explicit backup evidence and separate approval.

## Seed and backup separation

Migrations create schema only. Server startup calls `seedIfEmpty()` afterward;
it does nothing when users already exist, preventing migration-time reseeding.
The backup rehearsal confirms the restored database retains both application
relationships and the complete valid migration history.
