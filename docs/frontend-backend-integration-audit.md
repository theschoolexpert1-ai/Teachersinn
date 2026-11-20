# TeachersInn frontend–backend integration audit

## A. Scope

This report completes Phase 1 for the **browser-independent scope**. It audits
the vanilla JavaScript SPA against the established native HTTP API using source
inspection, VM-based frontend behavior tests, HTTP integration tests, and
disposable SQLite databases. It does not redesign the UI or change API
contracts, migrations, authentication backends, data backends, or themes.

**REAL-BROWSER VERIFICATION: NOT VERIFIED**

The Windows browser automation safety layer could not reliably determine the
current Chrome URL and stopped before interacting with the browser. No bypass,
replacement automation stack, or browser debugging protocol was used.

## B. Baseline

| Evidence | Initial | Final |
|---|---:|---:|
| Automated tests | 144 passed | 146 passed |
| Failed / skipped / todo | 0 / 0 / 0 | 0 / 0 / 0 |
| Registered API routes | 94 unique | 94 unique |
| JavaScript syntax | Pass | 78 files, zero failures |
| SQLite migration | `0003` | `0003`, checksums valid, none pending |

The active configuration remains SQLite with legacy authentication. All runtime
checks used explicitly named disposable directories. The active `.env` and the
existing application database were not modified.

## C. Frontend inventory

The frontend consists of `index.html`, `theme-init.js`, `app.js`, and
`styles.css`. `app.js` owns one hash router, one API helper, delegated action,
form, input, key and change handlers, transient in-memory state, safe HTML
templating, layouts, modals, and screen renderers.

| Area | Implemented frontend routes | API dependencies | Access and states |
|---|---|---|---|
| Landing and login | `#/` | `GET /api/me`, `POST /api/auth/login` | Public; form pending/error state |
| Registration | `#/register`, `#/confirmation-sent`, `#/confirm` | registration and verification endpoints | Public; confirmation success/failure states |
| Recovery | `#/forgot-password`, `#/reset-password` | recover, verify and reset endpoints | Public; invalid-link and form-error states |
| Public information | `#/verify/:code`, `#/legal` | public certificate verification | Public; valid/not-found certificate states |
| Dashboard | `#/dashboard` | dashboard and notification preview | User; loading shell, populated and empty sections, page-level error |
| Notifications | `#/notifications` | list, preview, read, read-all | User; filters, pagination, empty and error states |
| Learning | `#/learn`, `#/course/:id`, `#/course/:id/:lesson` | courses, enrollment, lessons | User; search/filter, locked/preview/progress states |
| Certificates | `#/certificates`, `#/certificate/:id` | certificate list | User; empty list, detail and print action |
| Workshops | `#/workshops`, `#/workshop/:id` | listing, register, cancel and calendar download | User; capacity, attendance and registration states |
| Educator network | `#/network`, `#/network/requests`, `#/network/connections`, `#/network/profile/:id` | educators and connections | User; discovery/filter and relationship states |
| Messaging | `#/messages`, `#/messages/:userId` | conversation list/thread and send | User; empty conversation, search and send pending states |
| Community | `#/community`, `#/community/:id`, `#/post/:id` | communities, discussions, posts and replies | User; search/sort/mine, empty and moderation states |
| Tutorials | `#/tutorials`, `#/tutorial/:id` | tutorial list/detail/save | User; search, related content and saved state |
| Lesson planning | `#/planner`, `/new`, `/templates`, `/calendar`, `/:id`, `/:id/edit` | plan overview and CRUD/duplicate | User; filters, calendar, empty and failure-preserving forms |
| Careers | `#/jobs`, `/browse`, `/applications`, `/cv`, `#/job/:id` | career profile, jobs and applications | User; readiness, filters, duplicate-safe application state |
| Support | `#/support`, `/mentorship`, `/wellbeing`, `#/ticket/:id` | tickets, replies, mentors and mentorships | User; domain-specific empty and transition states |
| Settings/profile | `#/settings[/section]`, `#/profile[/section]` | settings, profile, sessions, export and deletion | User; forms, preferences, privacy and destructive confirmation |
| Administration | `#/admin[/section]`, `#/admin/users/:id` | overview, analytics, users, content, attendance, support, moderation, audit and mentorship | Admin; frontend guards plus authoritative backend access checks |

All authenticated data routes first render the existing loading shell. Route
failures render a safe page-level error. Major collections have domain-specific
empty states. Mutating buttons/forms are disabled while their promise is
pending and are restored in `finally`.

## D. API mapping

The automated contract audit extracts more than 90 `api()` call sites and adds
the two direct authenticated downloads. Every method/path shape matches the
unchanged route inventory.

| Domain | Frontend methods and backend paths |
|---|---|
| Identity | `GET /api/me`; `POST /api/auth/{register,login,logout,password,recover,verify,reset-password,logout-others}`; `GET /api/auth/sessions` |
| Profile/settings | `PUT /api/profile`; `GET /api/settings`; `PUT /api/settings/notifications`; `POST /api/profile/delete`; direct `GET /api/profile/export` |
| Dashboard | `GET /api/dashboard` |
| Learning | `GET /api/courses[/:id]`; `POST /api/courses/:id/enroll`; `POST /api/lessons/:id/complete`; `GET /api/certificates`; public verification |
| Workshops | `GET /api/workshops`; register/cancel mutations; direct ICS download; administrator workshop list/create/delete/registrations/attendance |
| Network/messages | educator search/detail; connection list/create/respond/delete; message list/thread/send |
| Community | community list/detail; discussion search/create/detail/delete; reply create/delete; administrator discussion list |
| Notifications | list/preview, individual read, read-all and preference update |
| Plans/tutorials | plan overview/list/detail/create/update/delete/duplicate; tutorial list/detail/save toggle |
| Careers | career overview/profile/summary suggestion; jobs list/detail/apply; applications; administrator jobs/create/close |
| Support/mentorship | tickets list/detail/create/reply; mentors and mentorship list/create/respond; administrator ticket and mentorship reads/updates |
| Administration | overview, analytics, users list/detail/update, courses, jobs, workshops, attendance, discussions, tickets, mentorships and audit log |

The shared API helper uses same-origin cookie credentials, sets JSON content
type and the in-memory CSRF token on every non-GET request, parses safe backend
errors, and clears authenticated frontend state on HTTP 401. No session token,
password, or CSRF token is persisted to local storage. Backend routes without a
UI caller are permitted; the snapshot is a server contract, not a requirement
that every endpoint appear in navigation.

## E. Action audit

All 35 rendered actions have exactly one registered handler after correction:

`admin-unlock`, `apply-job`, `ask-mentor`, `cancel-connection`,
`cancel-workshop`, `close-job`, `close-modal`, `complete-lesson`, `connect`,
`delete-plan`, `delete-post`, `delete-reply`, `delete-workshop`,
`duplicate-plan`, `enroll`, `logout`, `logout-others`, `mentor-respond`,
`new-course`, `new-job`, `new-post`, `new-ticket`, `new-workshop`,
`open-notification`, `print`, `read-all-notifications`, `read-notification`,
`register-workshop`, `remove-connection`, `respond-conn`, `save-tut`,
`suggest-summary`, `toggle-menu`, `toggle-notifications`, and `toggle-sidebar`.

The audit checked endpoint/payload selection, confirmation where applicable,
success feedback, navigation/rerender behavior, pending-button disabling, and
error propagation. Destructive and representational operations remain governed
by backend authorization and constraints. No placeholder or no-op action was
found.

## F. Form audit

All 36 rendered forms have exactly one registered handler:

`admin-attendance-filter`, `admin-audit-search`, `admin-ticket-filter`,
`admin-user-search`, `career-profile`, `community-search`,
`conversation-search`, `course-search`, `delete-account`, `job-search`,
`login`, `mentor-req`, `net-search`, `new-course`, `new-job`, `new-post`,
`new-workshop`, `password`, `plan`, `plan-search`, `profile`, `recover`,
`register`, `reply`, `reset-password`, `search`, `send-msg`,
`settings-notifications`, `settings-personal`, `settings-privacy`,
`settings-professional`, `ticket`, `ticket-reply`, `tut-search`, `verify`, and
`workshop-search`.

Delegated submission extracts named fields, preserves checkbox/radio types,
clears the previous form error, disables the submit button, awaits the handler,
shows safe failure text, and always restores the button. Successful mutation
handlers rerender, navigate, or update the intended control only after the API
promise resolves. Password confirmation is checked before transmission.

## G. Authentication

Registration, login, current-user restoration, logout, password change,
recovery/reset feature gating, session listing/revocation and account deletion
map to existing endpoints and payloads. The isolated HTTP check proved legacy
admin login, cookie-based authenticated requests and CSRF issuance. Automated
backend tests cover expired/revoked/suspended sessions, rate limits and account
deletion rollback. Actual browser cookie storage and refresh behavior remain
not verified in a real browser.

## H. Teacher workflows

| Workflow | Browser-independent result |
|---|---|
| Dashboard and CPD | PASS — persisted dashboard response, progress, activity, workshops, plans and empty states tested |
| Learning/certificates | PASS — discovery, details, enrollment, completion, progress and verification contracts tested |
| Workshops | PASS — filters, details, capacity, register/cancel, attendance and ICS route mapped |
| Careers | PASS — profile/CV, rule-based summary, jobs, apply and application history tested |
| Networking/messaging | PASS — visibility, relationship states, conversations, escaping and send contract tested |
| Community | PASS — search/sort/mine, create, replies, ownership, moderation and empty states tested |
| Notifications | PASS — preview/list/filter/read/read-all/preferences and badge behavior tested |
| Lesson planning | PASS — overview, create/read/update/duplicate/delete, templates and calendar tested |
| Tutorials | PASS — listing, search, detail, related content and save toggle covered by frontend/backend tests |
| Support/mentorship | PASS — tickets/replies and mentorship request/respond transitions covered by frontend/backend tests |

## I. Administrator workflows

The overview, analytics, user list/detail and state management, course/job and
workshop publishing, attendance verification, audit log, support queue,
community moderation and mentorship activity screens use existing administrator
routes. UI role checks hide administrator navigation and return an
administrator-only state for direct client navigation. Server-side `admin`
access levels remain authoritative; isolated unauthenticated access returned
401 and the regression suite verifies ordinary-user 403 behavior.

## J. Validation, state and error handling

- HTML5 field constraints and bounded values complement server validation.
- The API helper preserves backend `{ error }` messages for 400, 401, 403, 404,
  409, 429, 500 and 503 responses without exposing diagnostics.
- Action and form delegates restore enabled state after success or failure and
  do not show success before awaited mutations complete.
- Render sequence numbers prevent an older route response replacing a newer
  navigation result.
- Valid empty collections use domain empty states rather than failure styling.
- Mutation retries are user-directed; no automatic retry can duplicate writes.
- Logout clears the in-memory user and cached domain state after server success.
- Backend uniqueness and transaction tests provide the final duplicate-write
  and rollback boundaries.

## K. Navigation and themes

Thirty-eight route definitions cover public, teacher and administrator screens.
Unauthenticated protected routes render the login view; authenticated `/` and
unknown routes normalize to the dashboard; administrator APIs still enforce
authorization. Hash links, deep-link renderers, sidebar targets and logout
redirects were inspected. Browser back/forward behavior is not verified.

Sky Blue remains the first-time default and Classic Golden remains optional.
System, light and dark modes, theme persistence, invalid-value fallback,
sidebar persistence and mobile drawer rules are covered by source and frontend
tests. Actual visual rendering in Chrome is not verified.

## L. Security and privacy

- Authentication uses HttpOnly same-origin cookies; frontend storage contains
  only theme, appearance and sidebar preferences.
- CSRF stays in memory and is attached to non-GET API requests.
- User content goes through the escaping template helper; regression tests
  cover malicious-looking community and message content.
- Password hashes and session tokens are neither requested nor rendered.
- Owner/admin boundaries are enforced in backend routes and repositories, not
  solely through hidden controls.
- Public notification links are allow-listed to safe hash-route characters.
- Privacy export and deletion retain their established authenticated routes and
  server-side safeguards.

## M. Issues found

| Severity | Issue and root cause | Correction | Evidence |
|---|---|---|---|
| Low | `actions.print` was assigned twice in `app.js`; the career assignment silently overwrote the identical certificate handler | Removed the duplicate so both print buttons use the single delegated handler | New handler synchronization test proves 35 unique action definitions and 36 unique form definitions |

No endpoint, payload, response-parsing, authorization, false-success, or
unhandled-handler defect was confirmed by the browser-independent audit.

## N. Test evidence

- `npm test`: 146 passed, zero failed/skipped/todo.
- Frontend suite: 55 passed, including handler synchronization and complete API
  route-contract checks.
- Syntax: 78 JavaScript files parsed successfully.
- Route inventory: 94 entries, 94 unique method/path pairs.
- Fresh disposable migration: `0001`–`0003`, valid checksums/schema, no pending
  migration, integrity `ok`, foreign keys enabled, zero violations.
- Backup/restore: 71 pages, integrity `ok`, version `0003`, zero foreign-key
  violations.
- Isolated HTTP: index, JavaScript, CSS, theme initializer and `/api/me` 200;
  unauthenticated dashboard 401; legacy login 200; authenticated dashboard and
  administrator overview 200; CSRF issued.
- Temporary listener and disposable directory were confirmed absent afterward.

## O. Remaining limitations and final assessment

**REAL-BROWSER VERIFICATION: NOT VERIFIED**

Browser-dependent appearance, focus order, native validation bubbles, cookie
inspection, history back/forward, downloads, print dialogs, responsive pixels,
and end-user workflow timing remain unverified. They require a supported browser
access host or user-led manual execution of the existing browser QA checklist.

| Scope | Assessment |
|---|---|
| Frontend/API contract | PASS |
| Actions and forms | PASS |
| Authentication and authorization integration | PASS for source, VM and HTTP evidence |
| Teacher and administrator domain integration | PASS for browser-independent evidence |
| Database/migration/backup compatibility | PASS |
| Real-browser behavior and visual QA | NOT VERIFIED |

**INTEGRATION AUDIT PHASE 1 COMPLETE — BROWSER-INDEPENDENT SCOPE**

This assessment is not a production-readiness declaration. The recommended
next phase is manual/supported-browser functional and accessibility QA across
desktop and mobile breakpoints, followed by staging-only load and operational
verification. That work has not been started.
