# Future SQLite-to-Supabase migration runbook

This is an unexecuted runbook. Every cloud write, Auth creation, real-data import, runtime activation, and deployment needs separate approval.

## Pre-cutover

1. Announce the maintenance window, owner, expected downtime, support path, and rollback decision time.
2. Stop background jobs and verify a restorable SQLite backup without modifying the live database.
3. Run SQLite integrity, foreign-key, duplicate-email, status, certificate, and ownership checks.
4. Complete the private identity manifest, administrator two-person review, Auth activation readiness, Resend/email delivery checks, and Storage inventory.
5. Verify the exact Supabase project, TLS, migration synchronization, RLS/policies/function ACL, backups, capacity, and empty/expected target state.
6. Run the Stage 3I dry-run against a separately verified snapshot. Review every count, dependency, fingerprint, exception, and expected sequence value.

## Migration window

1. Put the legacy application into enforced read-only maintenance mode; do not rely on user communication alone.
2. Capture and hash the final SQLite snapshot. Re-run integrity and compare it with the preflight inventory.
3. Create/verify only approved Auth identities, then freeze the identity manifest.
4. Execute narrowly privileged, project-specific batches in dependency order. Never disable RLS or foreign keys globally.
5. Commit and checkpoint a batch only after its constraints, source fingerprints, ownership, and business aggregates verify.
6. Reconcile identity sequences after preserved integer keys. Verify certificates, CPD, attendance, applications, relationships, messages, support, notifications, and audit retention—not only row counts.

## Cutover

Activate Supabase Auth and PostgreSQL only through separately approved configuration. Verify login/reset, secure cookies, session refresh/revocation, suspension, administrator access, cross-user denial, dashboard, learning, certificate verification, workshops, careers, networking, messaging, community, support, mentorship, plans, and audit behavior before reopening traffic. Keep SQLite frozen and immutable.

## Rollback and split-brain prevention

The last simple rollback point is before target activation and before any PostgreSQL-only user write. At that point, keep PostgreSQL closed, revert the approved deployment, restore/retain the verified SQLite snapshot, and invalidate newly issued sessions.

After PostgreSQL writes begin, changing environment flags is unsafe. Stop all writes, capture the PostgreSQL delta by mapped identity and immutable source/target keys, choose the authoritative system, reconcile and verify that delta, invalidate sessions, and only then reopen. Never allow simultaneous SQLite and PostgreSQL writes. Preserve the original snapshot, manifests, checkpoints, verification reports, and both database backups through formal acceptance.

## Tool commands

`npm run migration:dry-run -- --db <verified-snapshot> --manifest <private-manifest>` is the real-data planning interface; dry-run is always the default and this command has no write path. The separate synthetic cloud harness remains disabled unless its fresh Stage 3I authorization gate is complete.

`npm run migration:cloud-preflight` performs the Stage 3I read-only cloud baseline check. The same harness contains the disabled mutation path, but it requires the complete project-specific Stage 3I gate documented in `supabase-cloud-migration-rehearsal.md`. Do not set those values without fresh authorization.
