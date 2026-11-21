# Supabase runtime transition readiness

Status: **prepared but inactive**. SQLite and legacy authentication remain the defaults. This document does not authorize identity creation, data migration, runtime activation, or deployment.

## Legacy identity inventory

The read-only inventory generated on 2026-11-21 is stored under `.private/identity-inventories/` and excluded from version control. It contains legacy numeric identifiers, normalized email addresses, roles, suspension state, user-referencing ownership counts, empty future Auth UUID fields, and explicit approval fields. It excludes password hashes, sessions, tokens, message content, and other record contents.

The active `data/teachersinn.db` contains 13 identities: one administrator, twelve non-administrators, no suspended accounts, no duplicate normalized emails, no invalid role/status values, and no foreign-key violations. The source SHA-256 was unchanged by inventory collection.

This differs from the validated snapshot `20261120T100712176Z-7a8875cf5c47`, which contains 12 identities. The active database has one later active educator identity plus four additional audit rows and one notification. The project owner has classified the additional identity as a test account and selected all 13 identities for future migration scope. This is only a scope decision: it grants no mailbox verification, mapping approval, administrator approval, Auth creation, migration, activation, or deployment authority. The 12-account backup remains historical rollback evidence and is not the final migration snapshot.

## Identity mapping and approvals

Each mapping binds exactly one legacy integer ID to one captured Supabase Auth UUID and one normalized, mailbox-approved email. UUIDs must come from a separately authorized Auth creation and may not be invented, inferred by row order, or reused. Roles, suspension state, and every ownership relationship must reconcile before import.

All mappings require an identity owner, an independent privacy reviewer, and verified mailbox ownership. The administrator mapping additionally requires a business owner and an independent security reviewer. The private inventory deliberately marks every email, UUID, and approval as unapproved.

Legacy password hashes are never migrated. Account activation remains blocked until SMTP delivery is configured and validated. The future flow is: approve mapping; prove mailbox ownership; create/capture the Auth identity; send a one-time expiring activation link; verify email; choose a new password; establish a fresh HttpOnly Supabase session; enroll TOTP MFA where required; invalidate legacy sessions; and checkpoint completion. Invalid, expired, reused, disputed, or failed activation leaves the mapping unclaimed and data inaccessible. Administrator activation requires the independent approvals above and a reviewed recovery procedure.

## Inactive PostgreSQL runtime architecture

`backend/src/postgres/runtime.js` composes the existing PostgreSQL repository graph, HTTP services, all 98 route contracts, Supabase Auth bridge, account-deletion boundary, CSRF/origin enforcement, and clean pool shutdown. `backend/src/server.js` selects this bootstrap only when all of these deliberate flags are present:

```text
DATA_BACKEND=postgres
AUTH_BACKEND=supabase
ENABLE_POSTGRES_RUNTIME=1
```

The default path remains `DATA_BACKEND=sqlite` and `AUTH_BACKEND=legacy`. PostgreSQL selection fails closed; it never falls back to SQLite. In PostgreSQL mode, the server does not import `backend/src/db.js`, create `data/`, open SQLite, enable WAL, seed starter data, or store sessions locally.

The `pg` pool is lazy, bounded, and explicitly closed. Every authenticated repository operation starts a transaction, sets `ROLE authenticated`, installs transaction-local verified JWT claims, and releases the client after commit or rollback. Anonymous operations use `ROLE anon`. Identity is obtained from the server-verified Supabase session and propagated with `AsyncLocalStorage`; request bodies and arbitrary headers cannot select another user. Database errors are mapped to stable client-safe responses.

Supabase access and refresh tokens remain encrypted and authenticated inside `HttpOnly`, `SameSite=Strict` cookies. The bridge verifies the token server-side, checks authoritative account role/status, requires the approved legacy mapping, and resolves the migrated PostgreSQL profile. CSRF tokens and exact origin checks remain enforced for writes. Privileged Supabase credentials remain server-only and are used only for authoritative Auth/account operations; user data operations execute through the RLS-scoped PostgreSQL connection.

## Vercel compatibility

The inactive PostgreSQL bootstrap requires no writable application filesystem. For verified database TLS, stateful hosts may use `SUPABASE_DB_CA_CERT_PATH`; serverless environments may supply the PEM through the protected server-only `SUPABASE_DB_CA_CERT` variable. TLS verification remains mandatory.

The PostgreSQL path removes the known SQLite causes of Vercel `FUNCTION_INVOCATION_FAILED`: deployment-directory writes, SQLite WAL creation, startup migration/seeding, and local session persistence. It does not prove a production deployment. Before activation, an approved Vercel configuration must provide the environment variables, route static assets separately from the API server, confirm the supported Node version, run a preview deployment, validate connection limits/pooler mode, and inspect runtime logs. No deployment configuration was changed by this preparation.

Required server-only configuration includes the Supabase URL and keys, database URL, CA certificate, strong cookie secret, HTTPS application origin, secure cookies, trusted-proxy policy, bounded pool/timeouts, and the three activation flags. Secrets must be stored in the deployment environment, never committed or delivered to browsers.

## Validation and remaining blockers

Local tests verify private inventory normalization and duplicate detection, explicit serverless CA configuration, all 98 route contracts, no SQLite module load in PostgreSQL mode, fail-closed selection, clean connection shutdown, request identity isolation, RLS transaction setup, CSRF/origin checks, and safe database error mapping.

Remaining blockers are:

1. Review and approve mappings for all 13 in-scope identities; the scope decision itself is not identity approval.
2. Approve every identity mapping and independently approve the administrator mapping.
3. Configure and validate SMTP, confirmation, recovery, and activation delivery.
4. Create Auth identities only under separate authorization and capture their real UUIDs.
5. Approve and execute the real-data migration with fingerprint verification and rollback authority.
6. Validate the production pooler endpoint, TLS material, connection budget, preview runtime, static routing, logging, and monitoring.
7. Approve Auth/PostgreSQL activation and production deployment separately.

Future activation must follow the existing cutover runbook and readiness gates. This preparation grants none of those approvals.
