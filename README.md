# TeachersInn™

**The professional home for teachers and educators** — upskilling with CPD certificates, educator-only workshops, networking and communities, mentorship and support, a tutorials library, a lesson planner and a careers board.

© 2026 Poornaphala Media and Infotech Services LLP. All rights reserved.

---

## Quick start

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`). There are **no npm dependencies** to install.

```bash
cd teachersinn
ADMIN_EMAIL=you@yourschool.in ADMIN_PASSWORD='ChooseAStrongOne2026' npm start
# → http://localhost:3000
```

On first run the database is created in `data/teachersinn.db` and filled with starter content (8 courses, 6 workshops, 16 tutorials, 8 communities, sample mentors and jobs). If you don't set `ADMIN_PASSWORD`, a random admin password is printed once in the console — change it after signing in (Profile & Privacy → Security).

## Release verification

```bash
npm test
npm run verify:backup
npm run benchmark
npm run benchmark:db
npm run benchmark:frontend
npm audit --audit-level=high
```

See the [frontend performance audit](docs/frontend-performance-audit.md), the
[UI accessibility and responsive audit](docs/ui-accessibility-responsive-audit.md), the
[manual UI QA checklist](docs/ui-manual-qa-checklist.md), the
[course management and certificate verification guide](docs/course-management-certificate-verification.md), the
[frontend–backend integration audit](docs/frontend-backend-integration-audit.md), the
[backend final acceptance report](docs/backend-final-acceptance.md), the
[Phase 14 verification report](docs/phase14-verification.md), the
[manual browser QA checklist](docs/browser-qa-checklist.md), and the
[release-candidate manifest](docs/release-candidate.json).

See also the [application final acceptance report](docs/application-final-acceptance.md).
Phase 4 establishes automated and development-scope acceptance for the current
single-instance SQLite and legacy-authentication architecture: 162 automated
tests, 61 frontend tests and the ordered 98-route contract pass. Real-browser
verification and production readiness remain explicitly **NOT VERIFIED**.

The [Milestone 5 browser QA report](docs/browser-qa-report.md) records the
limited real-Chrome checks completed against a disposable local database.
Browser QA is partially complete; cross-browser, canonical viewport,
screen-reader, printing/download and browser-performance coverage remains open.

The native HTTP backend now uses incremental domain services and repositories
for authentication, learning/certificates, connections/messaging, workshops,
community discussions, support, mentorship, and selected administrator
workflows. Profiles, settings, privacy export/deletion, session management,
notifications, careers, lesson plans, and tutorials follow the same boundaries.
Dashboard aggregation, administrator publishing, workshop administration,
community discovery, and legacy session coordination now do as well. Dashboard
and community handlers are registered from domain route modules while one
native HTTP dispatcher retains all request security and error handling. Route
modules also cover learning, workshops, careers, notifications, lesson plans,
tutorials, and educator networking; duplicate registrations fail fast.
Profile, settings, support, and mentorship routes are modular as well, and an
HTTP authentication adapter owns cookie/feature-gating coordination.
Authentication and general administrator registration are modularized, with a
versioned 98-route inventory snapshot protecting methods, order, and access.
These modules share the existing SQLite connection;
services own transactions and repositories own parameterized SQL. Route
dispatch, security checks, and remaining domains are still centralized in
`src/server.js`. See the [backend architecture](docs/backend-architecture.md)
for the actual boundaries and remaining extraction work.

Shared validation rejects unsafe structured-to-integer coercion while retaining
existing numeric request formats. Centralized error mapping, contention
responses, authorization, rollback, and rate-limit boundaries are covered by
the disposable reliability suite.

## What's inside

| Area | Features |
|---|---|
| **Dashboard** | Personal greeting, CPD ring (50-hour annual goal), stats, continue-learning, weekly activity chart, upcoming workshops & lesson plans, community feed, notifications |
| **Upskilling** | NEP 2020/NCF, classroom management, digital tools & AI, assessment, inclusion, FLN, wellbeing, CTET/career courses; lesson-by-lesson progress; auto-issued certificates with public verification codes |
| **Workshops** | Online / in-person / hybrid sessions, seat limits, registration & cancellation, calendar (.ics) download, CPD hours |
| **Networking** | Educator directory & search, connection requests, private messaging (only between connections or mentor pairs), 8 subject/role communities with threads and replies |
| **Support** | Helpdesk tickets with staff replies, mentorship requests (mentors accept/decline/complete), wellbeing resources (Tele-MANAS 14416) |
| **Tutorials** | 16 step-by-step guides (lesson planning, Google Forms quizzes, DIKSHA, rubrics, PTMs, HPC, AI safety…), search, categories, save for later |
| **Lesson Planner** | Private plans with outcomes, materials, activities, assessment and reflection; printable |
| **Careers** | Teaching jobs board (admin-moderated) |
| **Profile & Privacy** | Profile, mentor opt-in, directory visibility, password change, active sessions, DPDP data export (JSON), account deletion |
| **Admin Console** | Platform metrics, member management (roles, suspend, unlock), support queue, publish courses/workshops/jobs, security audit log |

## Security layers

- **Passwords:** scrypt (memory-hard, N=32768) with per-user salt; constant-time comparison; policy (10+ chars, letters + numbers, not common, not containing your name/email)
- **Sessions:** 256-bit random tokens in `HttpOnly`, `SameSite=Strict` cookies (`Secure` + `__Host-` prefix in production); only SHA-256 hashes stored; 12-hour idle and 7-day absolute expiry; new token on every login (session-fixation defence); password change signs out all other devices
- **CSRF:** per-session synchroniser token on every write, plus Origin check and JSON-only request bodies
- **Brute force:** 5 failed sign-ins → 15-minute account lock; per-IP rate limits on sign-in (10/15 min), sign-up (5/hour), all API calls (300/min) and per-user writes (60/min); identical response and timing for unknown emails
- **Authorisation:** role-based access (educator / mentor / admin) enforced on the server for every route; users can only read/edit their own plans, tickets and messages
- **Injection & XSS:** every SQL query uses bound parameters; all user content is HTML-escaped on render; strict Content-Security-Policy (no inline scripts or styles); `X-Frame-Options: DENY`, `nosniff`, HSTS (on HTTPS), Referrer- and Permissions-Policy
- **Input handling:** length limits and type validation on every field, 64 KB request cap, request timeouts, path-traversal-safe static serving
- **Audit log:** sign-ins, failures, lockouts, permission denials, admin actions, exports and deletions — visible in Admin → Security log
- **Privacy (DPDP Act 2023):** explicit consent at sign-up with version and timestamp, data export, correction, directory opt-out, and account erasure. **No student/child data is collected.**

## Deploying to production

1. Run behind HTTPS (nginx, Caddy, or a cloud load balancer) and set:
   ```bash
   NODE_ENV=production PORT=3000 COOKIE_SECURE=1 TRUST_PROXY=1 \
   APP_ORIGIN=https://teachersinn.in ADMIN_EMAIL=… ADMIN_PASSWORD=… npm start
   ```
2. Keep it running with a process manager (systemd or `pm2 start src/server.js --name teachersinn`).
3. Back up `data/teachersinn.db` with SQLite's online backup mechanism and restore-test backups regularly. Set `TEACHERSINN_DATA_DIR` to durable private storage.
4. GoDaddy: shared hosting can't run Node — use a GoDaddy VPS (or any VPS/cloud VM), then point your domain's A record at it.

See [the production-readiness guide](docs/production-readiness.md) for the
reverse-proxy trust boundary, SQLite constraints, release checks, recovery
procedure, operations checklist, and outstanding blockers.

| Variable | Purpose | Default |
|---|---|---|
| `PORT` / `HOST` | Listen address | `3000` / `0.0.0.0` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin account (first run only) | `admin@teachersinn.local` / random |
| `COOKIE_SECURE` | `1` for HTTPS-only cookies | off |
| `TRUST_PROXY` | `1` when behind a reverse proxy | off |
| `APP_ORIGIN` | Exact public origin for the CSRF Origin check | request host |
| `PUBLIC_APP_ORIGIN` | Canonical origin used in public certificate verification links | `https://teachersinn.schoolexpert.in` |
| `TEACHERSINN_DATA_DIR` | Database folder | `./data` |
| `AUTH_BACKEND` | Authentication implementation (`legacy` or gated `supabase`) | `legacy` |
| `AUTH_COOKIE_SECRET` | 32+ character secret encrypting server-managed Supabase sessions | required only for Supabase Auth |

## Supabase migration (Stage A)

The repository contains a dormant Supabase foundation under `supabase/`. SQLite and the existing authentication system remain active; `DATA_BACKEND` defaults to `sqlite`, and selecting `supabase` fails closed until the application adapter and Auth bridge are complete.

- Copy `.env.example` to a local ignored environment file and supply development-project values only when working on the migration.
- Review the timestamped SQL files in `supabase/migrations/` before applying them to an isolated local or development project.
- Read `docs/supabase-migration.md` for identity mapping, password-claim, data reconciliation, cutover, and rollback procedures.
- Run `npm test` for the existing regression suite and the migration-foundation checks.

Do not apply these migrations to production or set `DATA_BACKEND=supabase` until the later migration stages have passed Auth, RLS, API-compatibility, and data-reconciliation tests.

## SQLite schema governance

SQLite startup now uses ordered, checksummed migrations with transactional
history, recognized legacy-schema adoption, drift detection, and a native
concurrency lock. The application still uses SQLite and legacy authentication.

Read [database architecture](docs/database-architecture.md) and the
[migration authoring guide](docs/database-migrations.md). The focused
[database performance report](docs/database-performance.md) records query-plan,
index, transaction, concurrency, and synthetic benchmark evidence. Database commands
always require an explicit path:

```bash
npm run db:status -- --db /path/to/teachersinn.db
npm run db:verify -- --db /path/to/teachersinn.db
npm run db:migrate -- --db /path/to/teachersinn.db --confirm-existing
```

Status and verification are read-only. Do not migrate the live application
database without an approved backup and explicit target review.

## Supabase Auth bridge (Stage B foundation)

The repository also contains a feature-gated Supabase Auth bridge. It is disabled by default and does not change the current SQLite/scrypt login flow. Review `docs/supabase-auth.md` before testing `AUTH_BACKEND=supabase`; that mode requires complete server-only configuration, an encrypted-session cookie secret, approved email templates, and exact claimed UUID-to-legacy-ID mappings. An unmapped Supabase UUID is never used as a SQLite identity.

## Project structure

```
teachersinn/
├── src/
│   ├── server.js     HTTP server, router, all REST API routes, static files
│   ├── security.js   hashing, tokens, rate limiting, headers, validation
│   ├── db.js         SQLite schema (25 tables) and query helpers
│   └── seed.js       starter courses, workshops, tutorials, communities, jobs
├── public/
│   ├── index.html    app shell
│   ├── app.js        single-page app (all screens)
│   ├── styles.css    design system (light & dark mode, mobile-responsive)
│   └── favicon.svg
├── LICENSE           proprietary notice — Poornaphala Media and Infotech Services LLP
└── package.json
```

## Suggested next steps

Email verification and password reset (needs an email provider), payment gateway for paid workshops, live video integration (Zoom/Meet/Jitsi links per workshop), file uploads for resources, and moving to PostgreSQL once you outgrow a single server.

---
TeachersInn™ · © 2026 Poornaphala Media and Infotech Services LLP. All rights reserved.
