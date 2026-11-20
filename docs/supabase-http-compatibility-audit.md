# Supabase HTTP compatibility audit

## Stage 3H continuation status

Security follow-up: migration `202611190010_fix_account_deletion_function_acl.sql` is applied and verified. The final function ACL is `{postgres=X/postgres, authenticated=X/postgres}`; effective permission checks reject `anon`, `service_role`, and `PUBLIC`.

The authorized Stage 3H cloud suite completed on 2026-11-19: **98 exercised, 98 passed, 0 failed, 0 blocked**. Representative cross-domain workflows, administrator authorization, identity isolation, suspension, CSRF/Origin enforcement, and controlled account deletion passed. Independent cleanup verification found no disposable Auth users, application rows, or Storage objects.

The continuation implementation supersedes the original `93 adapted / 5 blocked` snapshot below. All **98 contracts now compose locally**. The five formerly blocked rows have these current results:

| Route | Current resolution | Status |
| --- | --- | --- |
| `POST /api/profile/delete` | Current-password verification, database-audited preparation, sole-admin protection, and exact-ID Supabase Auth deletion coordinator | Cloud pass |
| `GET /api/admin/analytics` | PostgreSQL administrator reporting repository with the existing 7/30/all aggregates | Cloud pass |
| `GET /api/admin/mentorships` | Existing response columns/order/limit through administrator reporting repository | Cloud pass |
| `GET /api/admin/audit-log` | Administrator-only search and 50-row pagination over existing audit records | Cloud pass |
| `GET /api/admin/audit` | Administrator-only latest 300 audit records | Cloud pass |

Migration `202611190009_http_compatibility_security.sql` is applied. It adds only administrator mentorship SELECT visibility and audited self-deletion preparation.

Generated from the authoritative `test/fixtures/route-inventory.json` snapshot on 2026-11-19. Inventory preservation is not the same as cloud HTTP execution.

## Coverage summary

- Total contracts: **98**
- Contracts audited: **98**
- Route method/path/access inventory changed: **0**
- PostgreSQL service facade status: **98 adapted, 0 blocked**
- Real PostgreSQL HTTP routes exercised: **98/98 passed**
- Local harness security behaviors exercised: loopback, authentication, administrator authorization, Origin, JSON, CSRF, identity scoping, safe shutdown

## Contract matrix

| Route | Access | Domain/service | PostgreSQL equivalent | Async | Identity | Transaction | Response | Test status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `GET /api/me` | public | Authentication | Existing Supabase Auth bridge | Complete | Anonymous or verified session | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/register` | public | Authentication | Existing Supabase Auth bridge | Complete | Anonymous or verified session | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/login` | public | Authentication | Existing Supabase Auth bridge | Complete | Anonymous or verified session | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/logout` | user | Authentication | Existing Supabase Auth bridge | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/password` | user | Authentication | Existing Supabase Auth bridge | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/recover` | public | Authentication | Existing Supabase Auth bridge | Complete | Anonymous or verified session | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/verify` | public | Authentication | Existing Supabase Auth bridge | Complete | Anonymous or verified session | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/reset-password` | public | Authentication | Existing Supabase Auth bridge | Complete | Anonymous or verified session | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/auth/sessions` | user | Authentication | Existing Supabase Auth bridge | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/auth/logout-others` | user | Authentication | Existing Supabase Auth bridge | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `PUT /api/profile` | user | Profiles/settings | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/settings` | user | Profiles/settings | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `PUT /api/settings/notifications` | user | Profiles/settings | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/profile/export` | user | Profiles/settings | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/profile/delete` | user | Profiles/settings | Auth deletion coordinator missing | Missing | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | BLOCKED — explicit 501 |
| `GET /api/dashboard` | user | Dashboard | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/notifications/preview` | user | Notifications | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/notifications` | user | Notifications | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/notifications/:id/read` | user | Notifications | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/notifications/read` | user | Notifications | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/courses` | user | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/courses/:id` | user | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/courses/:id/enroll` | user | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/lessons/:id/complete` | user | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/certificates` | user | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/certificates/verify/:code` | public | Learning | Stage 3H HTTP service facade | Complete | Anonymous or verified session | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/workshops` | user | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/workshops/:id/register` | user | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/workshops/:id/cancel` | user | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/workshops/:id/ics` | user | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/workshops` | admin | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/workshops` | admin | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/workshops/:id/registrations` | admin | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/workshops/:workshopId/registrations/:registrationId/attendance` | admin | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `DELETE /api/admin/workshops/:id` | admin | Workshops | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/educators` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/educators/:id` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/connections` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/connections/:id/respond` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `DELETE /api/connections/:id` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/connections` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/messages` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/messages/:userId` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/messages/:userId` | user | Networking | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/communities` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/discussions` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/communities/:id/posts` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/communities/:id/posts` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/posts/:id` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/posts/:id/replies` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `DELETE /api/replies/:id` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `DELETE /api/posts/:id` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/tickets` | user | Support | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/tickets` | user | Support | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/tickets/:id` | user | Support | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/tickets/:id/replies` | user | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/mentors` | user | Mentorship | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/mentorships` | user | Mentorship | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/mentorships` | user | Mentorship | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/mentorships/:id/respond` | user | Mentorship | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/tutorials` | user | Tutorials | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/tutorials/:id` | user | Tutorials | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/tutorials/:id/save` | user | Tutorials | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/plans/overview` | user | Lesson planning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/plans` | user | Lesson planning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/plans/:id` | user | Lesson planning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/plans` | user | Lesson planning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `PUT /api/plans/:id` | user | Lesson planning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `DELETE /api/plans/:id` | user | Lesson planning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/plans/:id/duplicate` | user | Lesson planning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/career` | user | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/career-profile` | user | Profiles/settings | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `PUT /api/career-profile` | user | Profiles/settings | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/career-profile/summary-suggestion` | user | Profiles/settings | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/jobs` | user | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/jobs/:id` | user | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/jobs/:id/apply` | user | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/applications` | user | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/jobs` | admin | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/jobs/:id/close` | admin | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/overview` | admin | Administration | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/analytics` | admin | Administration | Administrator aggregate/audit repository missing | Missing | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | BLOCKED — explicit 501 |
| `GET /api/admin/users/:id` | admin | Administration | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/courses` | admin | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/courses/:id` | admin | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/jobs` | admin | Careers/jobs | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/discussions` | admin | Community | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/mentorships` | admin | Mentorship | Administrator aggregate/audit repository missing | Missing | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | BLOCKED — explicit 501 |
| `GET /api/admin/audit-log` | admin | Administration | Administrator aggregate/audit repository missing | Missing | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | BLOCKED — explicit 501 |
| `GET /api/admin/users` | admin | Administration | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/users/:id` | admin | Administration | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/tickets` | admin | Support | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/tickets/:id` | admin | Support | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/courses` | admin | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `PUT /api/admin/courses/:id` | admin | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `PUT /api/admin/courses/:id/lessons` | admin | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `POST /api/admin/courses/:id/status` | admin | Learning | Stage 3H HTTP service facade | Complete | Server-verified Supabase UUID | Repository-owned atomic transaction | Existing JSON/status contract retained | ADAPTED — cloud HTTP pending |
| `GET /api/admin/audit` | admin | Administration | Administrator aggregate/audit repository missing | Missing | Server-verified Supabase UUID | Read-only where supported | Existing JSON/status contract retained | BLOCKED — explicit 501 |

## Findings

The production dispatcher already awaits route handlers, so asynchronous transport does not require a route-contract change. The isolated harness uses the existing route registrar shape, a loopback-only listener, an authoritative injected session loader, request-scoped verified UUID identity, Origin/JSON/CSRF checks, administrator checks, safe PostgreSQL error mapping, and explicit shutdown.

Legacy route registration still supplies one integer-oriented identifier parser for both bigint resources and UUID users. The isolated composition must inject a dual identifier validator; production SQLite behavior remains unchanged.

## Resolved Stage 3H blockers

Coordinated account deletion, administrator analytics, mentorship inventory, audit-log queries, and the exact 98-route cloud HTTP run are implemented and validated. Production data migration and runtime/Auth cutover remain separately authorized future work.

