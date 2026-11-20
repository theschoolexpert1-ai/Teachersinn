# TeachersInn production migration readiness gates

Stage 3K establishes enforceable readiness gates only. It does not select or export production data, create Auth users, configure email, mutate Storage or Supabase, change `.env`, activate PostgreSQL, deploy, or schedule a cutover.

## Current findings

Stage 3J confirmed 12 legacy identities, 26 SQLite source tables, 26 PostgreSQL target tables, 13 Supabase migrations, four SQLite migrations, 98 HTTP contracts, and a safe legacy/SQLite runtime. The latest Stage 3I durable report proves the development project identity, verified TLS, full synthetic verification, idempotency, cleanup, and zero residual cloud data. These are migration-tooling facts, not production approvals.

The remaining gates are a fingerprinted final snapshot and independently approved restore; approved identity and administrator mappings; real SMTP delivery evidence; production Storage inventory and restore evidence; named maintenance, write-freeze, monitoring, and rollback owners; approved inactive runtime configuration; and a separate go/no-go authorization.

## Snapshot, backup, and restore approval

1. The data owner identifies the authoritative SQLite file during an approved write freeze. Tooling must never infer or copy it automatically.
2. A migration operator records the absolute source reference, capture time, source system, custody record, file size, SHA-256 fingerprint, SQLite integrity result, foreign-key result, migration version, table counts, and row counts. Reports contain counts and hashes, never record content.
3. Store the encrypted snapshot and immutable evidence in access-controlled backup storage. Record encryption/key owner, retention, and recovery contacts separately from the backup.
4. Restore into an isolated, non-networked validation directory. Open the restored file read-only and repeat SHA-256, `integrity_check`, `foreign_key_check`, schema compatibility, identity count, normalized-email uniqueness, all table counts, and Stage 3I dry-run validation.
5. The restored bytes must match the approved snapshot fingerprint. A reviewer who did not perform capture signs the restore evidence with name/role, timestamp, evidence reference, and disposition.
6. Any fingerprint, schema, count, or integrity mismatch is `FAIL`; recapture requires a new approval. The final production snapshot is not selected in Stage 3K.

The validator accepts the snapshot only through process-local `CUTOVER_BACKUP_PATH` and requires the same SHA-256 in both `productionSnapshot.sha256` and `backupRestore.restoredSha256` of the private approval bundle.

## Legacy identity approval workflow

The private JSON manifest contains exactly one entry per source identity:

```json
{
  "version": 1,
  "identities": [{
    "legacy_user_id": 1,
    "auth_user_id": "reviewed-supabase-uuid",
    "normalized_email": "private-address",
    "approved_role": "educator",
    "account_status": "active",
    "emailOwnershipApproved": true,
    "administratorApproved": false,
    "approvalReference": "private-review-reference"
  }]
}
```

Store it outside source control with least-privilege access and encryption at rest. Do not include password hashes, passwords, tokens, sessions, or unnecessary profile data. Enforce unique legacy IDs, normalized emails, and Auth UUIDs; exact source-email/role/status agreement; approved mailbox ownership; and an evidence reference. Preserve suspension. Administrator mappings require a second explicit approval and two-person review. The approval bundle binds its decision to the manifest SHA-256 so later edits invalidate approval.

No identity is created until separate authorization. Legacy password hashes are never migrated. Activation requires a one-time expiring link, a new password, verified mailbox ownership, fresh Supabase session, and invalidation of every legacy session. Failed or disputed activation remains checkpointed without creating duplicate UUIDs or escalating roles.

## Provider-neutral SMTP gate

Approval requires all of the following:

- provider and support owner selected;
- sending domain and sender identity verified;
- TLS mode and server-only credentials configured outside source control;
- exact Site URL and redirect allow-list approved;
- activation, verification, password recovery, reset, and security templates approved;
- real-inbox delivery plus invalid, expired, and reused link tests passed;
- generic account-recovery responses verified;
- bounce/complaint handling, provider rate limits, retry limits, monitoring, and failure recovery tested;
- logs verified free of secrets and authentication tokens.

Stage 3K does not choose a provider, configure credentials, or send email.

## Storage gate

The four expected buckets are `profile-photos`, `professional-documents`, `course-resources`, and `community-attachments`. Profile photos are public; the other buckets are private or authenticated according to existing policies. Path ownership, `owner_id`, extension/MIME restrictions, size limits, administrator-only course-resource writes, and unauthorized update/delete denial must be reverified.

Create a private inventory containing bucket, opaque object identifier, owner mapping, size, MIME type, checksum, creation time, and application reference. Do not copy object content into reports. Reconcile database references against objects in both directions and report missing/orphaned items by opaque identifier.

Back up objects with metadata and checksums to encrypted, access-controlled storage. Restore into an isolated test prefix/project, compare count and checksum, verify metadata/ownership and policy behavior, then remove only the isolated restore after explicit approval. The gate requires fingerprint-bound inventory approval, ownership and policy verification, backup and restore verification, missing-object checks, and reviewed rollback implications. Stage 3K performs none of these mutations.

## Operational roles and approval responsibilities

| Responsibility | Required decision |
| --- | --- |
| Incident commander | Opens/closes the window, coordinates escalation, records go/no-go |
| Migration operator | Captures approved snapshot, executes only the authorized plan, checkpoints evidence |
| Independent verification reviewer | Reviews fingerprints, identities, counts, ownership, constraints, and business rules |
| Auth/email owner | Approves identity creation, activation, templates, delivery, and recovery evidence |
| Storage owner | Approves inventory, ownership, backup, restore, and rollback evidence |
| Runtime/deployment owner | Prepares inactive configuration and performs only the separately approved release |
| Monitoring owner | Watches auth, HTTP, PostgreSQL, RLS, email, Storage, and support signals |
| Rollback authority | Alone authorizes stop/revert or post-write reconciliation |
| Business/data owner | Accepts user ownership, data completeness, and final production state |

The maintenance approval records window, scope, communication, duration, owners, and expiry. Write-freeze approval names the enforcement mechanism, worker shutdown, verification query, and owner. Monitoring approval defines dashboards, thresholds, paging, duration, and handoff. Rollback approval defines pre-write restoration and post-write delta reconciliation. Approvals expire when their fingerprinted artifact or intended window changes.

## Read-only gate validator

Run `npm run cutover:readiness`. The validator reads but never edits:

- `CUTOVER_BACKUP_PATH`
- `CUTOVER_IDENTITY_MANIFEST_PATH`
- `CUTOVER_STORAGE_INVENTORY_PATH`
- `CUTOVER_APPROVALS_PATH`

The private approval bundle contains `productionSnapshot`, `backupRestore`, `identityManifest`, `administratorMapping`, `smtp`, `storage`, `operations`, and `runtimeConfiguration`. Every approval has `approved: true`, a non-empty `approvedBy`, a valid `approvedAt`, and a future `expiresAt`. Fingerprint-bearing approvals must match the files read by the validator. Reports expose only counts, statuses, run IDs, and hashes—not private identity values or secrets.

The validator evaluates:

1. production snapshot approval;
2. independent restore approval;
3. complete unique identity manifest and approval;
4. separate administrator mapping approval;
5. configured and evidence-approved SMTP;
6. fingerprint-bound Storage readiness;
7. maintenance-window approval;
8. write-freeze readiness;
9. monitoring readiness;
10. named rollback authority;
11. 13-migration/26-table schema readiness and durable cloud evidence;
12. Stage 3I migration evidence;
13. approved future runtime configuration while current SQLite/legacy runtime remains unchanged.

Missing evidence is `NOT_CONFIGURED` or `BLOCKED`; malformed data or fingerprint mismatch is `FAIL`. The synthetic tests prove a complete evidence fixture can pass every gate without activating runtime. A real PASS is readiness evidence, not authorization to cut over.

## Security findings and controls

- Database-owner, Supabase secret/service-role, SMTP, backup encryption, and manifest credentials must remain server-side and separately scoped. Never place them in approval JSON or logs.
- Migration operators receive time-limited least privilege. Runtime code must never use database-owner credentials. User requests remain RLS-bound to verified UUID identity.
- Reverify 26 RLS-enabled tables, 60 policies, triggers, function ACLs, four Storage buckets, administrator checks, suspension, cross-user denial, and account deletion immediately before go/no-go.
- Keep verified TLS mandatory. Approval does not permit disabling certificate checks.
- Auth user creation and PostgreSQL import are not one transaction. Capture UUIDs and checkpoints immediately; never automatically delete a claimed real account.
- Approval artifacts require restricted read access, encryption, tamper-evident fingerprints, retention, and an audit trail. Reviewers must be independent of the operator for restore, administrator, and final acceptance decisions.
- Audit logs must record actions and evidence references without emails, hashes that function as credentials, tokens, secrets, message content, or private manifest rows.
- After any PostgreSQL-only production write, rollback requires a write stop, dual snapshots, delta reconciliation, ownership/fingerprint verification, and session invalidation. A flag reversal alone is prohibited.

## Go/no-go criteria

`GO` requires every validator gate to be `PASS`, current runtime safety to be `PASS`, no expired approval, unchanged fingerprints, expected empty/approved target state, healthy project/TLS, successful final dry-run, named operators online, monitoring active, rollback authority present, and a separate signed cutover authorization.

`NO-GO` applies to any `FAIL`, `BLOCKED`, `NOT_CONFIGURED`, changed artifact, unexpected source/target data, unhealthy cloud service, TLS failure, schema drift, identity dispute, email/Storage failure, unavailable owner, or inability to restore. Stop and preserve evidence; do not improvise a bypass.

## Authorization boundaries and blockers

Stage 3K authorizes local preparation, documentation, read-only inspection, and synthetic tests only. Separate explicit approval is required for snapshot capture/export, production access, real Auth creation, emails, SMTP/Auth dashboard changes, Storage inventory export/restore, real-data import, cleanup, maintenance mode, write freeze, environment/runtime changes, deployment, go/no-go acceptance, and rollback.

Current real gates remain incomplete: no production snapshot was selected; no final restore was independently approved; no private 12-user manifest or administrator decision was supplied; SMTP and real delivery are unconfigured; no production Storage inventory/restore evidence exists; operational owners and window are unapproved; and future runtime configuration lacks production acceptance. The next step is an offline, access-controlled evidence and responsibility review—not migration execution.
