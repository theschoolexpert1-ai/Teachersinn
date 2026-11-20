# Phase 14 local verification report

Date: 2026-11-14 (Asia/Calcutta)

## Scope and limitations

All work used disposable SQLite directories and localhost servers. The existing
database was not opened or changed. Git metadata and a usable browser host were
unavailable, so visual, viewport, screen-reader, and print verification remain
unverified. No screenshots were captured.

## Automated baseline and security

- Before changes: 83 passed, 0 failed, 0 skipped.
- Trusted HTTPS produces `Secure`, `HttpOnly`, `SameSite=Strict`,
  `__Host-tin_sid`; forwarded HTTPS is ignored when `TRUST_PROXY=0`.
- Authorization, ownership, CSRF, sessions, duplicate safety, themes, and all
  application module tests remain active.
- An unusable data directory exits unsuccessfully without claiming startup.
- A deliberately failed transaction leaves no partial record.

## Performance baseline

Command: `npm run benchmark`

Environment: Node v24.13.0, localhost, native Node HTTP, disposable SQLite WAL,
starter dataset. Each profile made 40 authenticated GET requests distributed
across dashboard, courses, workshops, educators, discussions, notifications,
administrator overview, and 30-day analytics.

| Concurrency | Requests | Success | Failure | Average | Median | P95 | P99 | Throughput |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 40 | 40 | 0 | 1.32 ms | 0.99 ms | 2.13 ms | 5.51 ms | 755.80 req/s |
| 5 | 40 | 40 | 0 | 3.84 ms | 3.52 ms | 5.75 ms | 6.24 ms | 1263.04 req/s |
| 10 | 40 | 40 | 0 | 7.14 ms | 6.65 ms | 10.93 ms | 11.24 ms | 1312.60 req/s |
| 25 | 40 | 40 | 0 | 16.65 ms | 15.82 ms | 22.93 ms | 23.04 ms | 1261.47 req/s |

These are development-machine smoke results, not production capacity or an
SLA. No long-duration soak or launch-sized dataset test was performed.

## Backup and restore rehearsal

Command: `npm run verify:backup`

The utility creates a disposable WAL database through the real schema, adds a
teacher and related enrollment, and uses Node's asynchronous `node:sqlite`
backup API while the source is open. The restored database is opened read-only:

- 52 pages copied;
- `PRAGMA integrity_check` returned `ok`;
- `PRAGMA foreign_key_check` returned zero violations;
- 10 users, 8 courses, and the representative enrollment were preserved;
- source, backup, and restored artifacts were removed afterward.

Backup encryption was not implemented or tested. Production requires an
approved secret-managed encryption facility, encrypted transport/storage,
retention policy, access auditing, and independent restore rehearsals.

## Static accessibility and contrast

Keyboard handlers, visible focus, landmarks, labels, live regions, Escape
behavior, reduced motion, 42px form controls, responsive tables, and early
theme initialization were inspected and remain covered by frontend tests.

| Pair | Ratio |
|---|---:|
| Classic body / white | 15.37:1 |
| Classic secondary / white | 7.66:1 |
| Classic button | 4.58:1 |
| Classic dark body | 15.78:1 |
| Sky body / background | 17.20:1 |
| Sky secondary / white | 7.58:1 |
| Sky button | 5.17:1 |
| Sky dark body | 17.89:1 |

These calculations do not replace rendered-state or assistive-technology QA.
