# Vercel PostgreSQL preview readiness

Status: **configuration prepared; deployment and activation remain unauthorized**.

## Runtime layout

Vercel detects the root `server.js` adapter, which loads `backend/src/server.js`. The backend selects PostgreSQL only when `DATA_BACKEND=postgres`, `AUTH_BACKEND=supabase`, and `ENABLE_POSTGRES_RUNTIME=1` are all present. Missing or inconsistent configuration fails startup; there is no SQLite fallback in PostgreSQL mode.

The PostgreSQL server composes all 98 API contracts and serves the existing `frontend/` frontend read-only. Extensionless frontend paths fall back to `index.html`; missing asset paths return 404. `vercel.json` enables Fluid Compute, includes `frontend/**` in the server function, and sets a bounded request duration. `.vercelignore` excludes SQLite, private evidence, tests, integration harnesses, scripts, documentation, and local environment files.

## Preview environment contract

Configure these values in the Vercel **Preview** environment only. Do not place values in `vercel.json`, source control, or browser code.

```text
DATA_BACKEND=postgres
AUTH_BACKEND=supabase
ENABLE_POSTGRES_RUNTIME=1
APP_ORIGIN=https://<exact-approved-preview-host>
PUBLIC_APP_ORIGIN=https://<exact-approved-preview-host>
COOKIE_SECURE=1
TRUST_PROXY=1
SUPABASE_URL=<development-project-url>
SUPABASE_PUBLISHABLE_KEY=<development-publishable-key>
SUPABASE_SECRET_KEY=<server-only-development-secret>
AUTH_COOKIE_SECRET=<server-only-random-secret-at-least-32-characters>
SUPABASE_DB_URL=<development-transaction-pooler-url>
SUPABASE_DB_CA_CERT=<verified-development-database-ca-pem>
POSTGRES_POOL_MAX=1
POSTGRES_CONNECT_TIMEOUT_MS=10000
POSTGRES_IDLE_TIMEOUT_MS=5000
POSTGRES_STATEMENT_TIMEOUT_MS=15000
POSTGRES_LOCK_TIMEOUT_MS=5000
```

Use the Supabase transaction pooler endpoint intended for serverless traffic, keep the function in the closest available region, and begin with `POSTGRES_POOL_MAX=1` per function instance. Confirm the development-project connection budget before increasing it. Direct database credentials and `SUPABASE_SECRET_KEY` are server-only.

`@vercel/functions` attaches the lazily created `pg` pool to the Fluid Compute lifecycle. Every repository operation still checks out one client, establishes a transaction-local `authenticated` or `anon` role and verified claims, commits or rolls back, and releases the client. Pool shutdown remains available for ordinary process termination.

## Authentication and request security

Supabase Auth access and refresh tokens are stored only in an authenticated encrypted HttpOnly cookie. Preview startup requires secure cookies, HTTPS, and trusted-proxy handling. Writes require the exact configured Origin, JSON content type, and the session CSRF token. The bridge validates tokens with Supabase, checks authoritative account status and role, and resolves only the mapped PostgreSQL profile. Administrator routes require the authoritative administrator role; repository RLS remains the final authorization boundary.

Registration, confirmation email, recovery email, MFA activation, real Auth creation, and real-data migration remain out of scope. Synthetic tests use injected Auth and repository fixtures and do not contact Supabase.

## Identity scope

Future migration planning includes all 13 current legacy identities. The additional educator is owner-classified as a test account. The private scope artifact records this selection without approving any email, UUID, role mapping, or account activation. The historical 12-account backup cannot be selected as the final migration snapshot because it does not cover the complete current source inventory.

Every identity still requires mailbox review, a captured real Auth UUID under separate authorization, mapping approval, and independent privacy review. The administrator mapping retains its separate approval gate. SMTP remains a blocker.

## Preview validation procedure

1. Review the preview-only environment inventory without printing values.
2. Confirm the project is linked to the intended Vercel preview project.
3. Run `vercel pull --environment=preview` only with explicit authorization.
4. Run `vercel build` and inspect the traced function for `frontend/**`; confirm `.private/`, `data/`, and `.env*` are absent.
5. Deploy only after separate preview-deployment authorization.
6. Confirm `/`, a static asset, `/api/me`, an anonymous protected route, Origin/CSRF rejection, safe database failure behavior, and runtime logs.
7. Use synthetic development identities only after separate authorization; do not import the 13 legacy accounts during preview validation.

No production domain, production environment variables, SMTP settings, cloud data, or active local configuration is changed by this preparation.
