# Supabase Stage 3B: users, profiles, and accounts

## Status and scope

Stage 3B adds asynchronous PostgreSQL repositories beside the active synchronous SQLite repositories. It does not connect them to `src/server.js`, change either active backend, activate Supabase Auth, migrate users, or change HTTP or frontend behavior.

The Management API identified `teachersinn-development` (`ivnmrhwxdawmzaakdhec`). Verified-TLS PostgreSQL preflight found the five expected prior migrations, no conflicting Stage 3B functions, and zero Auth users, profiles, career profiles, or notification preferences. Migration `202611190003_admin_user_management` was committed transactionally. The owner then explicitly authorized project-specific disposable testing despite the CLI main-branch `production` classification.

## Compatibility matrix

| Domain | Existing SQLite methods | Caller | PostgreSQL equivalent | Authorization | Transaction and tests |
| --- | --- | --- | --- | --- | --- |
| Profile | `profiles`: `update`, `exportData`, `deleteUser`, `adminCount` | `profiles.service` | `user`: `getOwn`, `getPublicProfile`, `updateOwnProfile`, `initializeOwn`, `getOwnAccount` | Verified UUID; profile RLS | Atomic initialization; contract tests pass |
| Career | `careers`: `careerProfile`, `careerUser`, `fullCareerUser`, `saveProfile` | `careers.service` | `career`: `getOwn`, `initializeOwn`, `saveOwn` | Owner-only RLS | Atomic upsert; contract tests pass |
| Preferences | `settings`: `preferences`, `savePreferences` | `settings.service` | `preferences`: `getOwn`, `initializeOwn`, `saveOwn` | Owner-only RLS; allowlist | Concurrent-safe upsert/defaults; tests pass |
| Account state | SQLite `users` fields | auth/settings/admin | `user.getOwn`, `user.getOwnAccount` | Database role/status, not claims | Transaction-local identity |
| Admin users | `admin`: `users`, `userDetail`, `findUser`, `updateUser` | `admin.service` | `admin`: `list`, `detail`, `statistics`, `updateAccount` | `public.is_admin()` plus RLS | Denial/allowlist tests pass |
| Data export | `profiles.exportData` | `profiles.service` | Not implemented | Must be owner-scoped | Stage 3C+ gap |
| Account deletion | password check and SQLite cascade | `profiles.service` | Deliberately not implemented | Supabase Auth owns password/deletion | Requires cross-system coordinator |

PostgreSQL contracts are async. SQLite repositories and services remain synchronous and unchanged. Future conversion can use `invokeRepository` as the incremental boundary.

## Identity, privacy, and settings

- Owner methods require server-verified `{ authUserId, verified: true }`; Stage 3A validates and installs the UUID transaction-locally.
- Owner IDs come from that identity, never a client target ID.
- Mutations use explicit field allowlists.
- Career profiles and preferences expose no target-user parameter and remain private under RLS.
- Public profiles contain only professional columns. Email, Auth metadata, tokens, and security fields are excluded.
- Theme and dark-mode preferences remain browser-local.
- Legacy numeric IDs are never treated as Supabase UUIDs.

## Administrator authorization

Admin search needs email from `auth.users`, which authenticated users cannot directly access. Migration `202611190003_admin_user_management.sql` adds two `SECURITY DEFINER` functions. They require authoritative `public.is_admin()`, expose only existing list/detail fields, cap results at 200, grant execution only to `authenticated`, and grant no Auth table privileges.

Role and suspension changes still use `account_settings_admin_update` RLS. The repository checks admin status first and rejects self-demotion/self-suspension. The existing last-active-admin rule remains a service-layer responsibility during future async conversion.

## Transactions and errors

All methods await `withUserTransaction`. Initialization and status changes use genuine transactions. `ON CONFLICT` makes initialization repeatable and updates concurrency-safe. Stage 3A clears identity before pool reuse. Safe error mapping covers constraints, authorization, serialization, timeouts, and connection failures without exposing SQL or credentials.

## Account lifecycle limitations

- The Auth trigger creates `profiles` and `account_settings`; `initializeOwn` verifies them and initializes owner tables.
- Suspension/reactivation and role changes are supported for a different user by an active admin.
- Password verification is not a repository concern.
- Auth deletion and database cleanup are not cross-system atomic. A future idempotent coordinator needs progress records, retries, and partial-failure recovery.
- No legacy user migration is performed.

## Cloud validation and cleanup

Completed: project identity/health, verified TLS, migration history, empty-table preflight, conflict check, transactional Stage 3B migration, and the real three-identity repository suite. It passed profile privacy/ownership, career ownership, preference defaults/isolation, authoritative administrator access, teacher role-escalation denial, suspension/reactivation, forced rollback, concurrent updates, and pooled identity isolation.

Independent post-test cleanup found zero Auth users, zero rows in all 26 public application tables, and zero Storage objects. The four expected Storage buckets and all six migrations remain present. Test authorization was process-local and project-specific; `.env` was unchanged.

## Stage 3C prerequisites

- Preserve the last-admin service guard.
- Approve the deletion coordinator before enabling deletion.
- Implement remaining domains before runtime activation.
- Keep SQLite and legacy Auth active until separately approved cutover.
