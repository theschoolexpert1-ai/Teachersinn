# Supabase PostgreSQL repository coverage audit

## Inventory result

The active SQLite runtime contains **16 repository factories and 159 repository methods**. The staged PostgreSQL layer exports **21 validated repository contracts and 93 higher-level methods**. Counts are not expected to match one-for-one: PostgreSQL methods intentionally combine SQLite read/check/write sequences into atomic operations.

All 15 route modules and 15 service modules were reviewed. The existing 98 method/path/access contracts remain authoritative.

| Domain | SQLite repository and methods | Calling service / routes | PostgreSQL repository and methods | Authorization / transaction | Status |
| --- | --- | --- | --- | --- | --- |
| Authentication sessions | `auth`: 13 methods | auth service; `/api/auth/*` | Supabase Auth adapter, not a data repository | Supabase token/session boundary | Auth-cutover dependency |
| Profiles/accounts | `profiles`: 4; `settings`: 3 | profile/settings services | user 5; preferences 3 | Owner; admin-count/delete/export require adapter orchestration | Partial runtime adaptation |
| Career/CV | `careers`: 11 | careers routes | career 3; jobs 4; admin jobs 3 | Owner/admin; atomic application | Complete |
| Learning | `learning`: 12; admin subset | learning/admin routes | learning 7; admin learning 6 | Owner/admin/anonymous verification; RPC transactions | Complete |
| Workshops/events | `workshops`: 12 | workshop/admin routes | workshops 5; admin workshops 5 | Owner/admin; capacity and attendance locks | Complete; no separate event model exists |
| Discovery/network | `messaging`: discovery/connection subset | networking routes | discovery 2; connections 5 | Visible/active profiles; participant identity; pair lock | Complete |
| Private messages | `messaging`: message subset | networking routes | messaging 3 | Eligible participants; atomic notification | Complete |
| Community | `community`: 14 | community/admin routes | community 8; moderation 4 | Author/admin; atomic reply notification | Complete |
| Notifications/activity | `notifications`: 7; `activity`: 3 | notification and cross-domain services | notifications 5 plus database-owned workflow notifications | Owner; creation restricted to workflow RPCs | Complete for current events; generic audit adapter remains runtime work |
| Mentorship | `mentorship`: 7 | mentorship service/routes | mentorship 4 | Mentee request; mentor transition; locked lifecycle | Implemented Stage 3F |
| Support | `support`: 7; admin ticket queries | support/admin routes | support 6 | Owner/admin; locked reply/status workflow | Implemented Stage 3F |
| Tutorials/resources | `tutorials`: 6 | tutorials service/routes | tutorials 3 | Authenticated visibility; owner-only saved state | Implemented Stage 3F |
| Lesson plans | `lesson-plans`: 7 | lesson-plan service/routes | lesson plans 7 | Owner RLS; duplicate advisory lock | Implemented Stage 3F |
| Dashboard | `dashboard`: 9 | dashboard route | dashboard 1 aggregate | One owner-scoped read transaction | Implemented Stage 3F |
| Administrator platform | `admin`: 28 | admin service/routes | admin user/learning/workshop/job/community plus support | Authoritative `is_admin()` | Functional domains covered; service adaptation still required |

## Confirmed schema and security gaps

Migration `202611190008_remaining_repository_security.sql` is applied. It adds an open-mentorship unique index, atomic mentorship request/transition functions, locked support reply/update functions, an admin-only support report, and full existing notification-preference category handling. It does not add a parallel event or payment model because neither exists in the application.

Auth password hashes and legacy session records must not be copied into PostgreSQL repositories. They are superseded by the separate Supabase Auth cutover. Profile export/account deletion and administrator aggregates require asynchronous service composition across the implemented repositories rather than new unrestricted database access.

## Coverage conclusion

Every SQLite repository and method has been classified. Current application data domains have a PostgreSQL equivalent or are explicitly identified as Auth/runtime-adaptation work. Migration 008, cloud lifecycle/concurrency validation, and independent zero-data cleanup verification pass.
