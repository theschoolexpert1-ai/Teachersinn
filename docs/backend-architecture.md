# TeachersInn backend architecture

## Overview

TeachersInn uses the native Node.js HTTP server, one shared `node:sqlite`
connection, SQLite WAL, and legacy cookie authentication by default. Phases 17
through 20 introduce an incremental service and repository layer without
changing routes, payloads, schema, migrations, or frontend.

```text
HTTP server/router -> domain service -> repository -> shared SQLite adapter
                   -> security and validation helpers
```

Repositories never import the HTTP server and services do not create database
connections. Dependencies are passed into factory functions, keeping modules
independently testable and preventing circular imports.

## HTTP request lifecycle

1. `server.js` applies security headers, parses the URL, and matches a route.
2. It loads the active session and enforces the route access level.
3. Authenticated writes pass origin, JSON content-type, CSRF, and rate checks.
4. The route validates path, query, and body values with `security.js`.
5. Extracted routes call a domain service; remaining routes stay inline.
6. The service enforces business rules and owns any required transaction.
7. Repositories execute parameterized SQL through the shared data adapter.
8. The existing serializer and safe error mapping produce the response.

## Module responsibilities

`src/server.js` still owns server creation, static files, session loading,
security headers, request limits, route matching, access enforcement, CSRF and
origin checks, validation, serialization, startup, and shutdown. Centralized
route registration preserves the mature native dispatch contract.

Extracted services own these workflows:

- `auth.service.js`: registration, login, logout, password changes and sessions;
- `learning.service.js`: courses, enrollment, progress and certificates;
- `messaging.service.js`: connection state and private messaging;
- `admin.service.js`: overview, analytics and managed-user transitions;
- `workshops.service.js`: registration, cancellation, attendance verification,
  participant notification, and workshop deletion;
- `community.service.js`: post/reply creation, duplicate suppression, ownership,
  moderation deletion, and linked notifications;
- `support.service.js`: owner-scoped tickets, replies, staff state changes,
  notifications, and administrator audit coordination;
- `mentorship.service.js`: requests, lifecycle transitions, participant
  authorization, and acceptance notifications that enable messaging.
- `profiles.service.js`: owner-scoped profile persistence, personal-data export,
  and password-confirmed transactional account deletion;
- `settings.service.js`: account overview and normalized notification preferences;
- `notifications.service.js`: owner-scoped preview, filters, 20-item pagination,
  category counts, and idempotent read-state changes;
- `careers.service.js`: career readiness/profile persistence, rule-based CV
  summary suggestions, job discovery, application history, and atomic job
  applications with audit evidence;
- `lesson-plans.service.js`: owner-scoped plan discovery, detail, creation,
  update, deletion, and duplication while retaining exact-duplicate suppression;
- `tutorials.service.js`: tutorial discovery, view tracking, related tutorials,
  and the existing saved-state toggle contract;
- `dashboard.service.js`: owner-scoped dashboard statistics, CPD totals, course
  progress, eight-week activity, upcoming workshops, lesson plans, community
  activity, and notification previews;
- the extended `admin.service.js`: course/job publishing and closing plus
  administrator catalogue reads, with publishing records and audit evidence in
  the same transaction;
- the extended `workshops.service.js`: administrator creation/listing,
  registration discovery, and calendar coordination in addition to attendance;
- the extended `community.service.js`: bounded discovery/search, community
  detail, post detail, and deterministic reply reads;
- `auth.service.js`: legacy session validation, expiry/revocation cleanup,
  suspended-account rejection, and bounded last-seen updates.

The matching repositories contain domain SQL. They preserve parameter binding,
ordering, ownership conditions, limits, and Phase 16 index-compatible query
shapes. They share the existing connection and never start transactions. The
small `activity.repository.js` centralizes parameterized audit and notification
writes. `notifications/categories.js` is the authoritative category list, link
mapping, and SQL classification. Activity writes participate in the caller's
transaction.

## Authentication and authorization boundaries

Legacy scrypt hashing, constant-time verification, throttling, account locks,
suspension enforcement, session expiration, rotation, and revocation are
unchanged. Registration and login return a token to the route only after the
service transaction commits; only then does the route issue the HttpOnly,
SameSite=Strict cookie.

The dispatcher remains the mandatory boundary for `public`, `user`, `mentor`,
and `admin` routes. Administrator role comes from the server-loaded account,
never request data. Resource checks remain explicit: enrollment, connection
participation, directory visibility, messaging eligibility, and owner-scoped
SQL were not replaced by a generic authorization abstraction.

Profile writes always use the session user ID. Directory visibility remains
enforced by educator discovery and profile queries. Exports include only the
authenticated user's existing records and exclude hashes and sessions. Account
deletion verifies the password, protects the final administrator, and deletes
the user plus existing cascades atomically while retaining null-actor audit
evidence.

## Transaction ownership

A service owns one transaction for each extracted multi-write workflow:

- registration: user, audit, welcome notification and session;
- login: login state, rotation, new session and audit;
- password change: password, other-session revocation and audit;
- course completion: progress, certificate, notification and audit;
- connection transitions and linked notifications;
- messages and linked notifications;
- managed-user state, session revocation and audit.
- workshop registration, attendance state/audit/notification, and deletion;
- discussion reply and author notification;
- support reply/status/notification and administrator ticket audit;
- mentorship request or transition and its linked notification.
- account deletion and its retained audit record.
- job application and its audit record.
- administrator course, job, and workshop publishing with audit evidence.

Repositories participate in the service-owned transaction. Cookies and HTTP
responses occur after commit. No network calls occur while holding a write lock.

## Error and database handling

Validation and domain failures retain their existing status and messages.
SQLite constraints map to safe HTTP 409; busy/locked errors map to HTTP 503 with
`Retry-After: 1`. Unexpected errors remain generic HTTP 500 while the original
diagnostic is logged. SQL, hashes, cookies, and tokens are never returned.

All modules use the singleton adapter from `src/data/index.js`. The driver, WAL,
foreign keys, busy timeout, and transaction helper are unchanged. The schema
remains at migration `0003`; migrations `0001` through `0003` are untouched.

## Validation and reliability

Route modules use the shared `security.js` helpers for bounded strings,
integers, identifiers, enumerations, email addresses, dates, and pagination.
Numeric strings remain compatible, while booleans, arrays, and objects are not
coerced into integers. `ValidationError` is explicitly classified and the
central dispatcher remains the only component that serializes failures.

Public responses retain the existing `{ error }` contract. Constraint failures
map to HTTP 409, SQLite busy/locked failures map to HTTP 503 with
`Retry-After: 1`, and unexpected errors return a generic message while internal
diagnostics remain server-side. Authentication cookies, CSRF/origin checks,
session expiry/revocation, administrator access, and owner-scoped repositories
remain unchanged. Reliability tests cover rollback, write contention,
constraints, fixed-window rate limits, malformed input, authorization, and
concurrent domain operations using disposable databases.

## Route modules and central dispatch

Domain route modules now register dashboard, community, learning, workshops,
careers, notifications, lesson plans, tutorials, and educator networking. They register handlers through
Profile, settings, support, and mentorship registration follow the same model.
`src/http/auth-adapter.js` centralizes legacy session-cookie establishment and
clearing plus inactive Supabase bridge delegation without owning business logic.
the existing `route(method, pattern, access, handler)` convention. They do not
create servers, parse bodies, load sessions, or map errors.

The route registry rejects duplicate method/path pairs during startup and is
characterized by regression tests. The one dispatcher in `server.js` remains authoritative for method and path
matching, static fallback, body parsing, authentication context, role checks,
write throttling, content type, CSRF and origin enforcement, security headers,
serialization, database error mapping, and request lifecycle. Validation that
belongs to dashboard/community HTTP inputs remains in their route modules;
business and persistence work remains in services and repositories.

Calendar serialization is a pure formatter in
`src/utils/workshop-calendar.js`; its database lookup stays in the workshop
repository and service. Audit and notification coordination continues to use
the single shared activity repository. Notification writes still participate
in the transaction owned by the calling service and respect the authoritative
category/preference mapping.

## Testing strategy

HTTP characterization tests protect routes, response structures, security,
persistence, concurrency, and rollback. Direct service tests cover transaction
ownership, rollback propagation, privacy, administrator boundaries, and linked
writes. Repository tests cover bound parameters, ownership predicates, sorting,
and limits. Tests use fakes or disposable SQLite databases.

The final development-scope evidence, acceptance matrix, operational limits,
and release gates are recorded in
[`backend-final-acceptance.md`](backend-final-acceptance.md). That decision does
not assert production readiness.

Concurrent HTTP tests cover attendance versus cancellation, simultaneous
support replies, conflicting mentorship responses, and identical community
replies. They also cover duplicate-safe job applications, simultaneous
lesson-plan updates, lesson-plan update versus deletion, and concurrent tutorial
save toggles. Lesson-plan updates intentionally retain last-write-wins behavior;
an update racing deletion ends either with a rejected update or an absent final
record. Tutorial saves retain toggle (not idempotent set) semantics while the
unique `(user_id, tutorial_id)` row prevents duplicates. Account-deletion
failure injection rejects its audit insert and proves the user and active
session roll back.

## Remaining monolithic components

Authentication and administrator registration now live in `auth.routes.js`
and `admin.routes.js`. Request dispatch and static delivery remain in
`server.js`. The ordered 94-route contract is fixed in
`test/fixtures/route-inventory.json`. Educator-directory reads live in the messaging repository;
administrator user, audit-log, and ticket-list reads live in the administrator
repository. The small `audit` and preference-aware `notify` adapter
functions remain server-owned because they bind the shared activity repository
to service factories without creating a second activity framework.

Future extraction should move the remaining stable route groups and inline
administrator/network read queries without splitting the central pipeline.
Generic CRUD repositories and a framework migration remain intentionally out
of scope.
