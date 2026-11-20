# TeachersInn production-readiness guide

This guide covers the active application: `DATA_BACKEND=sqlite` and
`AUTH_BACKEND=legacy`. Supabase and external email remain disabled. This is a
deployment checklist, not evidence that deployment has been approved.

## Supported runtime

- Node.js 22.13 or newer, using the built-in `node:sqlite` module.
- One long-running Node process behind a trusted HTTPS reverse proxy.
- Durable private storage for the SQLite database and WAL files.
- No Docker, build step, or runtime npm dependencies.

Install the repository, inject variables through the host's secret manager or
an ignored environment file, then run `npm test` and `npm start`. First start
creates the schema and starter records; never test it against the only copy of
live data.

## Production configuration

Set these values explicitly:

```text
NODE_ENV=production
DATA_BACKEND=sqlite
AUTH_BACKEND=legacy
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=https://teachersinn.example
COOKIE_SECURE=1
TRUST_PROXY=1
TEACHERSINN_DATA_DIR=/durable/private/teachersinn-data
ADMIN_EMAIL=<initial administrator email>
ADMIN_PASSWORD=<strong one-time initial password>
```

`APP_ORIGIN` must exactly match the public HTTPS origin, with no path or
trailing slash. `TRUST_PROXY=1` is safe only when direct access to Node is
blocked and the proxy overwrites `X-Forwarded-For` and `X-Forwarded-Proto`.
HTTPS sessions use a `Secure`, `HttpOnly`, `SameSite=Strict`, `__Host-` cookie;
keep `COOKIE_SECURE=1` as defence in depth.

Do not commit `.env`. The repository ignores `.env` and `.env.*`, except the
placeholder-only `.env.example`. Rotate the initial administrator password
after first sign-in.

## Reverse proxy and process requirements

- Terminate TLS at a maintained reverse proxy or load balancer and redirect
  HTTP to HTTPS.
- Preserve the intended host and overwrite forwarded protocol/address headers.
- Use one application process. Multiple replicas sharing SQLite over a network
  filesystem are unsupported.
- Use a supervisor for unexpected exits. `SIGINT` and `SIGTERM` drain active
  requests and close SQLite, with a 10-second unsuccessful-exit fallback.

Validate security headers at the public edge because a proxy can replace them.

## SQLite backup, migration, and recovery

`TEACHERSINN_DATA_DIR` must be private, writable only by the service account,
persistent across releases, and large enough for `teachersinn.db`, its WAL, and
shared-memory files.

Before each release:

1. Stop writes or use SQLite's online backup mechanism.
2. Copy the backup to separate encrypted storage.
3. Restore it into an isolated directory and run `PRAGMA integrity_check` and
   `PRAGMA foreign_key_check`.
4. Start the new release against a copy and verify additive migration and key
   workflows before scheduling the live change.

A plain file copy while WAL writes are active can be incomplete. Define and
rehearse recovery-time and recovery-point objectives; an unrestored backup is
not verified. Retain multiple dated backups and protect them as personal data.

Ordered, checksummed migrations run transactionally at startup and are recorded
in `schema_migrations`; failed migrations roll back schema and history together.
The current additive sequence ends at `0003`. Future non-additive changes still
require a reviewed versioned migration, verified backup, and rehearsed restore.

## Release verification

Use an isolated `TEACHERSINN_DATA_DIR`:

```sh
node --check src/server.js
node --check src/db.js
node --check src/security.js
node --check public/app.js
node --check public/theme-init.js
npm test
npm audit --audit-level=high
npm run verify:backup
npm run benchmark
npm run benchmark:db
```

Then smoke-test through the staging HTTPS proxy:

- static assets, registration, login, logout, password change, session
  revocation, suspension, and administrator authorization;
- cross-user isolation for messages, CVs, applications, lesson plans,
  notifications, settings, and exports;
- course completion, certificate uniqueness, verified workshop attendance,
  CPD award and reversal;
- Sky Blue first-visit default, saved Classic Golden, and light/dark/system;
- real-browser keyboard, assistive-technology, contrast, overflow, and touch
  checks at 1440, 1280, 1024, 768, 390, 375, and 320 pixels.

## Operations and diagnostics

Unexpected server errors are logged while API clients receive generic 500
responses. Store logs with access control and rotation. Never log request
bodies, cookies, authorization values, passwords, tokens, messages, or exports.

Monitor availability, HTTP 5xx and latency, disk capacity, backup age,
certificate expiry, integrity checks, and repeated authentication lockouts.
External monitoring is intentionally not configured in this repository.

## Current release blockers

Before calling the application production-ready, the deployment owner must:

- select a host with durable private storage and a single-instance model;
- validate real HTTPS, DNS, certificates, proxy headers, secrets, and firewall;
- complete staging browser and assistive-technology testing (the Phase 14
  browser access host was unavailable);
- run representative load and soak tests;
- productionize the locally verified SQLite backup/restore method, then
  encrypt, retain, independently restore-test, and monitor backups;
- define alerting, incident response, rollback, retention, and privacy
  procedures.

Supabase, Resend, production deployment, and School Expert integration remain
disabled and outside this phase.
