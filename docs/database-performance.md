# TeachersInn database performance and transaction report

## Scope and method

Phase 16 audited the native Node.js/SQLite implementation without reading or
changing the existing application database. The initial regression baseline
was 99 passing tests. The HTTP benchmark used a disposable seeded database;
query plans and focused measurements used reproducible in-memory databases with
equivalent version-0002 and version-0003 data.

The SQL inventory found 275 SQL statement occurrences across the server,
database, migrations, seed, scripts, and tests. Application access paths cover
identity and sessions, dashboards, courses, workshops, connections, messages,
communities, careers, plans, support, mentorship, notifications, and admin.

## Query inventory and pagination

| Area | Main tables and shape | Expected size | Finding |
|---|---|---:|---|
| Dashboard and courses | courses, lessons, enrollments, progress | tens to thousands | Child lookups needed course/order and course/user indexes |
| Workshops | workshops, workshop_regs | tens to thousands | Workshop/status filtering scanned registrations |
| Network and messages | users, connections, messages | hundreds to thousands | Inbox lacked a recipient lookup path |
| Communities | communities, posts, replies | tens to thousands | Post and reply child queries scanned |
| Careers and plans | jobs, applications, lesson_plans | tens to thousands | Owner/date and job/application lookups needed support |
| Support and mentorship | tickets, replies, mentorships | tens to thousands | Owner/status and child lookups needed support |
| Notifications | notifications | thousands | Existing read-state index could not serve every newest-first query |
| Administration | users, audit_log and aggregates | hundreds to thousands | User audit lookup scanned; global aggregate scans are appropriate |

Collection parameters are parsed as bounded integers and ownership predicates
remain in SQL. Notifications and administrator audit results retain validated
page/offset contracts and deterministic ordering. Messages are capped at 200,
community results at 150, directory results at 100, and administrative lists
at 200. Small platform-managed catalogues remain unpaginated. Keyset pagination
would reduce deep-offset work for audit logs and messages, but was not added
because it would change public response contracts.

## Query-plan findings and index migration

Before migration `0003`, representative notification, lesson-plan, ticket, and
course-child queries used scans and/or temporary sort B-trees. Community posts,
replies, workshop registrations, and user audit history scanned their tables.
The message inbox used an existing covering index for one branch but lacked a
recipient lookup path.

Migration `0003_query_performance_indexes` adds seventeen indexes: course lesson ordering,
course enrollments, lesson completion, workshop registration filtering, both
connection directions, message recipients, community posts and replies,
support tickets and replies, both mentorship roles, lesson-plan dates, job
applications, newest-first notifications, and user audit history.

Existing primary-key, unique, and five named indexes were retained. No index was
added for small catalogue tables or global whole-table aggregates because a
scan is appropriate. Redundant single-column indexes covered by primary or
unique keys were rejected. Query-plan tests verify critical new indexes and
the removal of temporary sorting from the covered notification query.

## Focused benchmark

The benchmark creates 300 users, 100 courses, 2,000 lessons, 3,000 enrollments,
50 workshops, 3,000 registrations, 10,000 messages, 3,000 posts, 6,000 replies,
3,000 job applications, 20,000 notifications, 3,000 lesson plans, 3,000
tickets, and 10,000 audit rows. Each query runs 250 measured repetitions after
warm-up. Values are milliseconds on the development machine and are not a
production capacity claim.

| Operation | Before avg / p95 | After avg / p95 | Average change |
|---|---:|---:|---:|
| Notifications | 0.4284 / 0.4395 | 0.0183 / 0.0203 | -95.7% |
| Message inbox | 0.5554 / 0.5690 | 0.0288 / 0.0291 | -94.8% |
| Community posts | 0.0943 / 0.1059 | 0.0802 / 0.0858 | -15.0% |
| Replies | 0.2381 / 0.2429 | 0.0035 / 0.0036 | -98.5% |
| Workshop registrations | 0.1380 / 0.1430 | 0.0188 / 0.0219 | -86.4% |
| Job application count | 0.1112 / 0.1144 | 0.0026 / 0.0027 | -97.7% |
| Lesson plans | 0.1650 / 0.1683 | 0.0193 / 0.0212 | -88.3% |
| Support tickets | 0.2031 / 0.2173 | 0.0842 / 0.0904 | -58.5% |
| Course lessons | 0.0958 / 0.0988 | 0.0154 / 0.0171 | -83.9% |
| Enrollment count | 0.1111 / 0.1135 | 0.0026 / 0.0027 | -97.7% |
| User audit history | 0.5919 / 0.6722 | 0.2927 / 0.3384 | -50.9% |

Use `npm run benchmark:db` to reproduce this comparison. Timing varies by
runtime and hardware; correctness and plan assertions are covered separately.

## Transactions, integrity, and concurrency

The transaction helper now rejects accidental nesting and always rolls back on
an exception. Atomic boundaries cover registration and sessions, login
rotation, logout, password changes, course completion/certificate issue,
connections, messages, community replies, ticket replies, mentorship changes,
and related administrator changes. Cookies are set only after the associated
session transaction commits. Existing workshop, attendance, job-application,
and admin-course transactions were retained. No network work occurs while a
transaction holds the writer lock.

Primary/unique constraints already prevent duplicate enrollments, workshop
registrations, lesson progress, job applications, certificate codes, and
directed connection requests. Tests exercise concurrent duplicate enrollments,
lesson completion/certificate issue, job applications, and reverse connection
requests. A deliberately failing notification insert proves its linked message
rolls back. A second SQLite connection holding `BEGIN IMMEDIATE` proves lock
contention returns HTTP 503 with `Retry-After: 1` and no partial plan record.

SQLite constraint failures return a generic HTTP 409. Busy/locked failures
return a generic retryable 503. Unexpected failures remain generic 500s while
the original diagnostic is logged internally. No automatic retry was added:
the five-second busy timeout is retained and blind retry of non-idempotent
writes could duplicate work.

## Remaining limitations

Phase 24 reverified WAL, foreign keys, the five-second busy timeout, HTTP 503
contention mapping, transaction rollback, concurrent domain workflows, and the
backup/restore path against disposable databases. No schema or index changes
were required.

Phase 25 repeated the disposable HTTP smoke benchmark on Node.js v24.13.0. All
160 requests succeeded. Average/p95 latency in milliseconds was 1.34/2.72 at
concurrency 1, 3.69/5.62 at 5, 6.93/10.49 at 10, and 18.80/25.04 at 25. These
localhost observations are development evidence only, not a production
capacity claim. The focused database benchmark also completed and selected the
version-`0003` indexes for its audited query shapes.

- SQLite supports one writer and local durable storage, not shared network filesystems.
- Deep offset pagination can slow down for very large message and audit tables.
- Some small catalogue endpoints are intentionally unpaginated.
- Message inbox grouping still needs a temporary group/order B-tree, although
  the recipient branch is indexed.
- Most domain SQL now lives in repositories. A smaller set of networking and
  administrator management reads remains in `server.js` for later incremental
  extraction.
- Production-like load, soak tests, and operational volumes are not verified
  by the disposable development benchmark.
