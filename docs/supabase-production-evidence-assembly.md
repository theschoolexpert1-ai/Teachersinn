# TeachersInn production evidence assembly

Stage 3L provides a secure evidence workflow. It grants no approval and performs no production migration, Auth creation, email delivery, cloud mutation, runtime change, or deployment. The Stage 3K read-only validator remains the source of truth.

## Evidence inventory

| Gate | Required evidence | Current status | Owner | Independent reviewer | Binding and freshness |
| --- | --- | --- | --- | --- | --- |
| Production snapshot | Provenance, integrity, schema/count report, SHA-256, selection decision | `NOT_CONFIGURED` | Data owner | Restore reviewer | Snapshot SHA-256; expires at approved cutover window |
| Backup restore | Isolated restore report with matching SHA-256, integrity, FKs, counts | `NOT_CONFIGURED` | Backup operator | Independent restore reviewer | Restored SHA-256 equals snapshot; recapture invalidates |
| Identity manifest | 12 complete unique mappings, email ownership, role/status evidence | `NOT_CONFIGURED` | Identity owner | Privacy reviewer | Manifest SHA-256; any edit invalidates |
| Administrator mapping | Separate administrator decision and evidence reference | `BLOCKED` | Business owner | Security reviewer | Bound to approved manifest; short-lived |
| SMTP | Provider/domain/sender/templates, real delivery, bounce/rate/failure evidence | `NOT_CONFIGURED` | Email owner | Security reviewer | Configuration/template fingerprints and test date |
| Storage | Four-bucket object/owner/checksum inventory, policy, backup/restore reconciliation | `NOT_CONFIGURED` | Storage owner | Independent verifier | Inventory SHA-256; rerun after object changes |
| Maintenance window | Window, scope, communications, owners, expiry | `NOT_CONFIGURED` | Incident commander | Business owner | Exact release/window; expires when window closes |
| Write freeze | Enforcement mechanism, worker stop, verification evidence | `NOT_CONFIGURED` | Runtime owner | Migration verifier | Final snapshot/window; expires on resumed writes |
| Monitoring | Dashboards, thresholds, paging, duration, owner/handoff | `NOT_CONFIGURED` | Operations owner | Incident commander | Exact release/window |
| Rollback authority | Named decision-maker, pre/post-write procedures and contacts | `NOT_CONFIGURED` | Rollback authority | Business owner | Exact window/release |
| Supabase schema | 13 migrations, 26 tables, RLS/policies/functions/ACL and TLS evidence | `PASS` locally/cloud rehearsal | Database owner | Migration verifier | Latest durable run plus final pre-cutover recheck |
| Migration evidence | Stage 3I run, 26 batches, fingerprints, ownership, rollback/idempotency | `PASS` for synthetic rehearsal | Migration operator | Independent verifier | Run `2026-11-20T09-39-09-303Z-6dcb589935c7`; production snapshot requires new evidence |
| Runtime configuration | Server-only Supabase/PostgreSQL settings, verified CA, bridge/CSRF/cookies, inactive flags | `NOT_CONFIGURED` | Deployment owner | Security reviewer | Configuration fingerprint; secret values excluded |

Every approval record requires `approved: true`, a named `approvedBy`, valid `approvedAt`, and a future `expiresAt`. Missing or expired evidence is never a pass. Fingerprinted artifacts must match the exact files evaluated. Approvals are decisions by accountable people; tooling cannot create them.

## Private evidence storage

Use `.private/production-evidence/`, which is already excluded from version control. Restrict access to named operators/reviewers, use encrypted storage for backups and manifests, and keep encryption keys outside the evidence directory. Do not synchronize the directory to an unapproved service.

The assembler permits writes only beneath that directory, uses create-exclusive temporary files and atomic rename, and writes restrictive file modes where supported. It redacts email-shaped values and fields whose names imply passwords, secrets, tokens, connection strings, or private keys. Reports contain hashes, counts, opaque references, and statuses—not records, passwords, tokens, SMTP credentials, or raw personal information.

Retain artifact SHA-256 values, custody references, reviewer decisions, and timestamps. Expired approvals remain retained as historical audit evidence but cannot satisfy readiness. Artifact changes require a new fingerprint and approval. Back up the evidence package separately with access/audit controls.

## Snapshot and restore workflow

1. A data owner explicitly identifies candidate paths; tooling must not scan user directories or infer the authoritative database.
2. During a separately approved write freeze, capture provenance: source system, capture time, operator, and custody reference.
3. Run the snapshot command against an explicitly named file. It opens SQLite read-only, calculates SHA-256, checks `integrity_check`, `foreign_key_check`, all 26 source tables, migration compatibility, row counts, and identity count.
4. Store the resulting report under `.private/production-evidence/`. The report remains unapproved.
5. Restore the encrypted backup to an isolated path. Rerun the same command and require identical SHA-256, table/row counts, integrity, and compatibility.
6. An independent reviewer compares capture and restore evidence and records a time-limited decision in the private approval bundle.
7. Never commit or attach the SQLite file, manifest, or record contents to source control.

Example, after an authorized operator has supplied an isolated candidate and non-sensitive provenance JSON:

```text
node scripts/migration/evidence-assembly.js snapshot --db C:\isolated\candidate.db --provenance C:\secure\provenance.json --out .private\production-evidence\snapshot-report.json
```

This command validates; it does not copy, select, or approve the candidate.

### Consistent SQLite backup creation

`scripts/migration/sqlite-backup.js` uses Node's supported `node:sqlite` Online Backup API. It does not copy the live database file and remains consistent with WAL-mode databases while writes are occurring. The source is opened read-only; SQLite creates the backup through its snapshot-aware backup mechanism.

The workflow writes first to a unique temporary file beneath `.private/production-backups/`, validates it, applies private file permissions where supported, and atomically renames it to `<timestamp>-<random-id>.db`. Existing identifiers and files are rejected and never overwritten. A failed operation removes only its incomplete temporary artifact.

Before the rename, verification requires SQLite integrity `ok`, zero foreign-key violations, exactly 26 application/operational tables, all 26 Stage 3I source mappings, and readable record counts. It then copies the completed backup—not the active database—into an isolated operating-system temporary directory and repeats integrity, foreign-key, table, migration-compatibility, count, and SHA-256 checks. The isolated restore is always removed.

The evidence report is written atomically beneath `.private/production-evidence/` and contains only the unique backup identifier, creation time, opaque source identifier, mechanism, WAL-consistency statement, backup filename and SHA-256, counts, integrity results, provenance status, isolated-restore results, `VALIDATED_UNAPPROVED` candidate status, and missing approvals. It contains no user rows or credentials.

The command fails closed for the active `data/teachersinn.db`. A future execution requires both `RUN_REAL_SQLITE_BACKUP=1` and the exact process-local authorization phrase expected by the tool, supplied only after separate explicit authorization. Synthetic databases do not require that real-data gate. Stage 3L preparation did not set either gate and did not create a real-data backup.

## Identity evidence workflow

Create the private manifest described in `supabase-production-migration-readiness.md`. Validate exact coverage of all 12 source IDs; unique normalized emails and UUIDs; exact source role and status; preserved suspension; mailbox-ownership approval; and a private evidence reference. Password hashes and legacy sessions are forbidden.

The privacy reviewer verifies coverage and ownership without placing raw addresses in reports. A separate security/business reviewer approves administrator mappings. Hash the final manifest and bind both approvals to it. Any correction invalidates both decisions. Supabase Auth UUID assignment and user creation remain separately authorized future operations.

## SMTP evidence workflow

Use a provider-neutral private template recording provider owner, verified domain and sender, TLS/configuration readiness, Site URL and redirects, activation and recovery template reviews, real-inbox test references, invalid/expired/reused link outcomes, generic recovery behavior, bounce/complaint procedures, quotas and rate limits, monitoring, and failure recovery. Credentials and token-hash links never enter evidence files. Stage 3L neither selects a provider nor sends email.

## Storage evidence workflow

Inventory the four expected buckets and record opaque object reference, owner mapping, size, MIME type, checksum, creation time, and application reference. Verify object-to-database and database-to-object reconciliation, bucket visibility, path ownership, MIME/extension and size limits, administrator-only course-resource writes, and unauthorized read/update/delete rejection.

Record encrypted backup provenance and an isolated restore comparison by object count, checksum, metadata, and ownership. Document missing/orphaned objects and rollback consequences. Bind approval to the inventory SHA-256. Do not upload, download, delete, or restore real objects without separate authorization.

## Operational approval workflow

The private bundle contains separately expiring decisions for:

- maintenance window: scope, timing, communications, incident commander, business owner;
- write freeze: enforcement mechanism, background-worker shutdown, proof query, final snapshot;
- migration operator and independent verifier: identity, least privilege, availability, handoff;
- monitoring: dashboards, alerts, thresholds, paging, duration, owner;
- rollback authority: named decision-maker and both pre-write and post-write procedures;
- go/no-go: every gate PASS, unchanged fingerprints, healthy services, staff online;
- escalation: severity levels, contacts, response times, evidence preservation.

Templates default every `approved` field to `false`. No tool promotes them automatically.

## Runtime evidence

Validate the future configuration without changing active `.env`: Supabase URL/publishable/server secret presence; direct/pooler PostgreSQL URL as appropriate; CA path and `rejectUnauthorized: true`; cookie secret strength; exact application origin; secure HttpOnly/SameSite cookies; CSRF and origin checks; server-side identity; suspension and administrator enforcement; Auth refresh/revocation; and database-owner/service-role separation.

The current process must still report `DATA_BACKEND=sqlite`, `AUTH_BACKEND=legacy`, and PostgreSQL runtime disabled. Configuration readiness is not activation permission. Rollback evidence must include verified restore, write-freeze control, session invalidation, and post-PostgreSQL-write delta reconciliation.

## Tool usage

Generate a non-approving private template:

```text
node scripts/migration/evidence-assembly.js templates --out .private\production-evidence\approval-template.json
```

Generate the current 13-gate inventory:

```text
node scripts/migration/evidence-assembly.js inventory --out .private\production-evidence\gate-inventory.json
```

Evaluate supplied evidence through the source-of-truth validator:

```text
npm run cutover:readiness
```

Supply paths only as process-local variables: `CUTOVER_BACKUP_PATH`, `CUTOVER_IDENTITY_MANIFEST_PATH`, `CUTOVER_STORAGE_INVENTORY_PATH`, and `CUTOVER_APPROVALS_PATH`. Do not write them into `.env`. The validator prints statuses, counts, hashes, and missing variable names—not secrets or manifest rows.

## Current blockers and next step

Real readiness remains blocked because no final snapshot/restore approval, private 12-user manifest, administrator approval, SMTP delivery evidence, Storage inventory/restore evidence, operational approvals, or accepted future runtime configuration was supplied. The Stage 3I synthetic run and local schema checks remain valid preparation evidence but cannot substitute for production evidence.

The next step is for named owners to assemble these private artifacts offline, conduct independent review, set explicit expiration dates, and run the validator. Even a future all-PASS report does not authorize migration; production access, Auth creation, data import, email, Storage operations, runtime activation, deployment, go/no-go, and rollback each retain separate authorization boundaries.
