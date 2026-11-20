# Stage 3I legacy authentication transition

## Current authentication evidence

Legacy IDs are SQLite auto-increment integers. Passwords use application-specific Node `scrypt` records with per-user salt and parameters embedded in the stored value. Supabase Auth does not consume this application record format through the current bridge, so Stage 3I treats hashes as non-portable. Hashes are never placed in the migration manifest, PostgreSQL, logs, or documentation. Legacy sessions are SHA-256 token hashes with CSRF state and absolute/idle expiry; they are not transferable and must be invalidated.

SQLite stores unique case-insensitive email, role (`educator`, `mentor`, `admin`), status (`active`, `suspended`), and consent evidence, but it does not store authoritative email-verification evidence. The current 12 identities have no duplicate normalized email and no orphaned foreign-key references. That does not prove mailbox ownership.

## Private reconciliation manifest

The version-1 manifest is private, permission-restricted, excluded from source control, and contains one reviewed entry per legacy user:

```json
{"legacy_user_id":12,"auth_user_id":"reviewed-uuid","normalized_email":"private","approved_role":"educator","approval_reference":"ticket-or-signed-review"}
```

The tool requires unique legacy IDs, unique UUIDs, unique normalized emails, exact source-email agreement, and exact approved-role agreement. Missing, extra, cross-user, malformed, or administrator mappings fail closed. UUIDs are created or selected only by a separately authorized server-side reconciliation process; clients cannot submit mappings. `legacy_user_map` provides resumability and explicit pending/invited/claimed/failed/skipped state.

## Activation strategy

1. Freeze the reviewed identity inventory and resolve duplicate/ambiguous mailboxes manually.
2. Create Supabase Auth accounts only under future authorization, without granting application access yet.
3. Require verified email plus a one-time, expiring activation/password-reset flow. Email alone is not sufficient where ownership is disputed; use an approved support review with non-public legacy evidence.
4. Keep migrated application rows inaccessible until the manifest entry is approved and the Auth UUID matches.
5. Create profile/settings/preferences with the reviewed role. Never derive administrator role from email or user metadata.
6. Keep suspended users suspended; activation does not reactivate them.
7. Invalidate every legacy session at cutover and require fresh authentication.

Expired, invalid, or reused activation links are rejected. Repeated attempts remain rate-limited. Failed activation leaves the mapping non-claimed and data inaccessible. Administrator activation requires two-person review and a last-administrator recovery procedure. Account recovery must not reveal whether an address exists.

Supabase Auth operations and PostgreSQL import transactions are separate. A failed Auth step cannot be rolled back as part of a SQL transaction; checkpoint states and compensating cleanup must record the exact identity and never retry destructive operations automatically. No activation email or Auth user is created during Stage 3I.
