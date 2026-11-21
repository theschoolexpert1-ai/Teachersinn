# Supabase HTTP integration — Stage 3H

## ACL correction status

Migrations `202611190009_http_compatibility_security` and `202611190010_fix_account_deletion_function_acl` are applied. Supabase default privileges initially granted direct function execution to `anon`, `authenticated`, and `service_role`; migration `0010` narrows `prepare_own_account_deletion(inet)` to `postgres` and `authenticated` only. Catalog and effective-execution checks confirm `anon`, `service_role`, and `PUBLIC` cannot execute it, while an authenticated call without `auth.uid()` reaches the function and is rejected. The remote project has 13 synchronized migrations and no pending migration.

## Architecture

Stage 3H adds an isolated compatibility layer without changing the active server:

```text
loopback HTTP harness
  -> existing route registrar contract
  -> PostgreSQL HTTP service facade
  -> 21 PostgreSQL repositories
  -> verified transaction-local Supabase UUID
```

`backend/src/postgres/http-context.js` stores only the server-verified identity in `AsyncLocalStorage`. A facade call that receives an owner UUID must match that identity. Arbitrary headers, body user IDs, unsigned claims, and legacy numeric IDs cannot establish identity.

`backend/src/postgres/http-services.js` adapts existing route-facing method names to asynchronous PostgreSQL repositories. It does not contain SQL and does not fall back to SQLite. `backend/src/postgres/http-harness.js` supplies the test-only loopback dispatcher, authoritative session-loader boundary, Origin/JSON/CSRF enforcement, access checks, error mapping, and idempotent shutdown.

The active `backend/src/server.js`, `DATA_BACKEND=sqlite`, and `AUTH_BACKEND=legacy` remain unchanged.

## Backend-selection safety

The Stage 3G requirements remain authoritative: `DATA_BACKEND=postgres`, `AUTH_BACKEND=supabase`, `ENABLE_POSTGRES_RUNTIME=1`, a database URL, and a trusted CA path are all required before the integration graph can be created. Stage 3H adds no implicit selection, fallback, migration, deployment, or account conversion.

## Contract status

The authoritative 98-contract inventory is audited in `supabase-http-compatibility-audit.md`.

- 98/98 method, path, and access contracts audited.
- All 98 route contracts compose locally through a repository-backed facade or existing Supabase Auth bridge path.
- The five former gaps have PostgreSQL implementations. Migrations `202611190009` and `202611190010` are applied and synchronized.
- The authorized cloud suite exercised all 98 method/path/access contracts: 98 passed, 0 failed, 0 blocked.

## Local security validation

Local isolated-harness tests verify loopback binding, missing-session rejection, administrator authorization, Origin rejection, CSRF rejection, successful CSRF-protected writes, server-verified UUID propagation, cross-user UUID rejection, suspension rejection, explicit unsupported-operation errors, and clean shutdown.

The harness accepts an authoritative session loader. A future cloud suite must inject the existing Supabase Auth bridge; it must not implement header-based impersonation or a test-only authentication bypass.

## Transactions and errors

Each facade method delegates to the existing PostgreSQL repository transaction boundary. Database functions continue to own atomic multi-write workflows. PostgreSQL errors are passed through the existing safe mapper. Unsupported compatibility paths return a deliberate HTTP 501 rather than silently using SQLite or partially writing data.

## Cloud status

On 2026-11-19 the project-specific Stage 3H suite passed against `teachersinn-development` (`ivnmrhwxdawmzaakdhec`) using verified TLS and four disposable Supabase Auth identities. It covered representative end-to-end workflows in every PostgreSQL domain, administrator authorization, cross-user isolation, Origin/JSON/CSRF enforcement, suspension, duplicate rejection, public certificate verification, and one controlled teacher deletion. The suite reported 98/98 HTTP contracts passed and account deletion passed.

Independent post-test verification found zero Auth users, zero rows in all 26 application tables, and zero Storage objects. All four buckets, 60 policies, RLS on all 26 tables, and all 13 migrations remain intact. `npm test` passed 202/202 and `npm audit --audit-level=high` found no vulnerabilities.

## Remaining cutover prerequisites

1. Reconcile legacy identities with Supabase Auth UUIDs.
2. Approve real-data migration, rollback, Auth cutover, and runtime activation separately.
3. Perform production backup, deployment, observability, and rollback rehearsals before cutover.

Stage 3H preparation does not make the application production-ready and does not activate PostgreSQL or Supabase Auth.
