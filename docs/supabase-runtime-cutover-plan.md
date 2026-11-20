# Supabase PostgreSQL runtime cutover plan

> Stage 3I prepared migration tooling and a runbook only. SQLite/legacy Auth remain active; PostgreSQL/Supabase Auth remain inactive. Runtime activation, deployment, and rollback rehearsal require separate approval.

## Activation checklist

1. Approve a maintenance window, backups, identity manifest, data manifest, and rollback owner.
2. Confirm all Supabase migrations and RLS/security-function audits.
3. Complete Auth reconciliation and data migration validation.
   The private version-1 identity manifest must pass exact email/role agreement, UUID uniqueness, ownership, and administrator review; the content-aware verification report must pass, not only row counts.
4. Configure `SUPABASE_DB_URL`, `SUPABASE_DB_CA_CERT_PATH`, pool/timeouts, Supabase URL/keys, cookie secret, application origin, and secure-cookie/proxy settings outside source control.
5. Run verified-TLS health, Auth, RLS, cross-domain, API parity, and cleanup tests.
6. Deploy with explicit `AUTH_BACKEND=supabase`, `DATA_BACKEND=postgres`, and `ENABLE_POSTGRES_RUNTIME=1` only after change approval.
7. Run smoke tests for login, dashboard, learning, workshop, message, ticket, and admin authorization before opening traffic.

Missing configuration, legacy Auth, an unverified/suspended identity, migration drift, or TLS failure must prevent startup. There is no automatic PostgreSQL-to-SQLite fallback and no automatic startup migration.

## Recovery

Continuously monitor connection saturation, database errors, RLS denials, Auth refresh, and business aggregates. Stop writes on integrity or identity anomalies. Restore only from verified backups. If post-cutover writes exist, reconcile the PostgreSQL delta before any SQLite rollback; simply changing an environment flag would lose data. Invalidate affected sessions and rerun integrity, foreign-key, count, ownership, and API smoke checks before recovery completion.
