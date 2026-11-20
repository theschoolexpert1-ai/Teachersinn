# Stage 3I migration constraint audit

## Outcome

The synthetic plan now has a valid trigger-aware topological order. The two cloud failures are covered by regression tests:

- `tutorials.steps` accepts a JSONB array, avoids double encoding, and rejects JSON null/object shapes.
- `courses -> lessons -> enrollments -> lesson_progress` is mandatory because PostgreSQL prevents curriculum changes after the first enrollment.

No trigger, constraint, RLS policy, or function is disabled. This audit is local/simulated evidence plus read-only schema inspection; it is not a successful cloud import.

## PostgreSQL constraint classes

- Foreign keys cover Auth/profile ownership and every parent-child domain. Deletes use cascade, restrict, or set-null according to retained ownership semantics.
- Unique rules cover normalized email/Auth mappings, course lesson positions, enrollment/progress/view composites, applications, directed and unordered connections, open mentorship pairs, certificate codes, and catalogue names.
- Checks enforce roles/statuses, booleans, positive durations/capacity/positions, distinct participants, JSONB array shape, completion/certificate coupling, and bounded profile/plan values.
- There are no application exclusion constraints.
- Insert/update triggers create profile/settings rows after Auth creation, synchronize course publication, lock course rows during enrollment, prohibit curriculum changes after enrollment, enforce mentorship status transitions on updates, and maintain server-owned update timestamps.
- Security-definer functions enforce authenticated identity, administrator authorization, active accounts, capacity, workshop timing, attendance timing, accepted networking/mentorship messaging eligibility, duplicate suppression, support closure, mentorship lifecycle, certificate completion, notifications, and retained account-deletion audit behavior. Direct owner-level migration does not invoke all workflow RPCs, so equivalent source validation is mandatory.

## Complete 26-batch plan

| # | Source | Target | Rows | Required before insert | Trigger/business prerequisite |
|---:|---|---|---:|---|---|
| 1 | users | account_settings | 3 | Captured Auth users | Auth trigger row exists; reviewed role/status; admin mapping exact |
| 2 | communities | communities | 1 | — | Unique name |
| 3 | courses | courses | 1 | — | Publication trigger; status and `published` must agree |
| 4 | users | legacy_user_map | 3 | Captured Auth users | UUID, legacy ID, normalized email unique; Auth delete is restricted until cleanup |
| 5 | users | profiles | 3 | Captured Auth users | Auth trigger row exists; UUID/legacy ID unique |
| 6 | tutorials | tutorials | 1 | — | Steps validated and bound as one JSONB array |
| 7 | audit_log | audit_log | 1 | profiles | Nullable actor mapping; retain legacy ID; no inferred admin role |
| 8 | career_profiles | career_profiles | 1 | profiles | Owner exists; template allowlist |
| 9 | connections | connections | 1 | profiles | Distinct users; unique directed and unordered pair |
| 10 | jobs | jobs | 1 | profiles | Valid status/type; optional poster mapped |
| 11 | lesson_plans | lesson_plans | 1 | profiles | Owner, date, and duration valid |
| 12 | lessons | lessons | 1 | courses | Unique positive position; must precede every enrollment |
| 13 | mentorships | mentorships | 1 | profiles | Distinct users; valid status; unique requested/active pair |
| 14 | notification_preferences | notification_preferences | 1 | profiles | Owner and boolean categories valid |
| 15 | notifications | notifications | 1 | profiles | Owner exists; private content excluded from logs |
| 16 | posts | posts | 1 | communities, profiles | Parent community and owner exist |
| 17 | tickets | tickets | 1 | profiles | Owner, status, priority valid |
| 18 | tutorial_views | tutorial_views | 1 | profiles, tutorials | Composite owner/tutorial unique |
| 19 | workshops | workshops | 1 | profiles | Positive capacity/duration; valid mode; creator mapped |
| 20 | enrollments | enrollments | 1 | profiles, courses, lessons | Curriculum already fixed; completion and certificate paired |
| 21 | job_applications | job_applications | 1 | profiles, jobs | Unique user/job; applied status; parent exists |
| 22 | messages | messages | 1 | profiles, connections, mentorships | Accepted connection or active mentorship exists; users differ |
| 23 | replies | replies | 1 | posts, profiles | Parent and owner exist |
| 24 | ticket_replies | ticket_replies | 1 | tickets, profiles | Ticket precedes replies; nullable actor mapped |
| 25 | workshop_regs | workshop_regs | 1 | profiles, workshops | Capacity; attendance/status agreement; final attendance has admin evidence |
| 26 | lesson_progress | lesson_progress | 1 | profiles, lessons, enrollments | Owner enrolled in lesson course; completed course has all progress |

The generated machine-readable version is produced by `npm run migration:constraint-audit`. Every declared prerequisite must have a lower insertion position. Cleanup uses the exact reverse order, so each child is deleted before its parents and `legacy_user_map` is removed before Auth deletion.

## Source business validation

The transformer now fails closed on missing FKs/identity mappings, duplicate certificates, incomplete completed-course progress, certificate/completion mismatch, publication mismatch, workshop over-capacity, inconsistent attendance evidence, non-admin attendance verification, unordered duplicate connections, duplicate open mentorships, ineligible historical messages, unsupported statuses, invalid JSON/timestamps, cross-user progress ownership, and dependency cycles.

## Retry readiness and remaining authorization

The harness still requires the exact project, verified TLS, empty baseline, 13 migrations, 26 RLS tables, 60 policies, four buckets, restricted deletion-function ACL, and all four Stage 3I process-local mutation gates. It captures Auth UUIDs immediately, checkpoints only committed batches, verifies transformed content/ownership, repeats execution for idempotency, deletes captured rows by exact keys in reverse order, deletes only captured Auth users, and independently verifies zero residual state.

Another cloud run is not authorized by this audit. Fresh authorization must cover only three synthetic Auth users, 32 synthetic target rows, 26 batches, rollback/recovery/idempotency verification, captured cleanup, and final read-only verification.
