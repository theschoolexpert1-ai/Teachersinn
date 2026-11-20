# Supabase Stage 3F remaining repositories

Stage 3F adds and validates mentorship, support, tutorials, lesson plans, and dashboard repositories without activating PostgreSQL. Migration `202611190008_remaining_repository_security.sql` is applied to the dedicated development project; the gated cloud suite passes and independent cleanup is clean. See `supabase-repository-coverage-audit.md` for the full method inventory.

Mentorship preserves only `requested → active`, `requested → declined`, and `active → completed`. Requests derive the mentee from `auth.uid()`, require an active opt-in mentor, prevent open duplicates, and create preference-aware notifications atomically. Only the mentor can transition a request.

Support preserves `open`, `in_progress`, `resolved`, and `closed`. Ticket owners see only their records. Replies lock the ticket and reject closed tickets. Administrator replies may move an open ticket to `in_progress`; administrator state changes create both notification and audit records in the same transaction. Admin email reporting uses a narrow security-definer function rather than Auth-table grants.

Tutorials remain globally readable to authenticated users, while `tutorial_views` is owner-only. Detail viewing upserts `viewed_at`; save toggling is duplicate-safe; missing tutorials return 404. No new resource or payment infrastructure is introduced.

Lesson plans preserve search, filters, ownership, duplicate suppression, CRUD, and copy behavior. Dashboard data is assembled in one owner-scoped read transaction from existing learning, workshop, network, support, planning, community, and notification tables.

The passing `RUN_STAGE3F_MUTATIONS=1` cloud suite uses two teachers and one administrator. It covers concurrent mentorship requests and acceptance, lifecycle rules, support ownership and close/reply concurrency, closed-state/admin workflows, tutorial saved state, lesson-plan ownership/duplicates/rollback, dashboard aggregation, pool identity isolation, audit capture, and exact cleanup. Independent inventory confirmed zero Auth users, zero application rows, zero Storage objects, four preserved buckets, and RLS on every public table.

Stage 3G prerequisites are preservation of the eleven synchronized migrations and passing Stage 3F security baseline, followed by separately authorized service adaptation/Auth reconciliation work. SQLite and legacy authentication remain active.
