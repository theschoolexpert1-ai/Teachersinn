# TeachersInn frontend performance audit

## A. Scope and baseline

Phase 3 reviews initial loading, JavaScript execution, SPA routing, DOM
rendering, API coordination, listeners, timers, list/search processing, CSS,
themes and resource isolation using Node.js v24.13.0 on Windows and the existing
VM/HTTP/disposable-SQLite tools.

Initial baseline: 149 passing tests, 58 frontend tests, zero failures/skips and
94 unique API routes.

**REAL-BROWSER PERFORMANCE: NOT VERIFIED**

No approved browser performance host was available. This report does not claim
Web Vitals, browser paint/layout, heap, frame-rate, device or network results.

## B. Assets and initial loading

Final uncompressed HTTP measurements:

| Asset | Bytes | Loading behavior |
|---|---:|---|
| `index.html` | 915 | Document |
| `theme-init.js` | 802 | Early, preventing theme flash |
| `app.js` | 183,220 | Deferred |
| `styles.css` | 96,349 | Render-blocking stylesheet |
| `favicon.svg` | 220 | Browser icon |

The five initial requests include the document and favicon. No duplicate asset,
runtime font, bundler dependency or unnecessary blocking application script was
found. `theme-init.js` performs bounded preference reads before CSS;
`app.js` restores `/api/me` and resolves one hash route. Unauthenticated startup
does not request protected data. Moving theme initialization later would risk a
visible flash, so it was preserved.

## C. SPA routing and rendering

The router parses once per render, finds one route, and uses a monotonic sequence
to ignore stale responses. Accessibility focus and scroll behavior remain
intact. Delegated events prevent listener rebinding.

Full-container replacement is deliberate in this small framework-free SPA. A
controlled 500-item catalogue remained single-digit milliseconds, so a virtual
DOM, virtualization or rendering rewrite was not justified.

## D. Confirmed defects and corrections

### Concurrent identical GET duplication — medium

`render()` starts badge refresh while the dashboard route independently loads
`/api/dashboard`; the prior helper issued both requests. A request-scoped `Map`
now coalesces only simultaneous GETs with the exact same path. Entries disappear
on settlement, so no persistent private-data cache exists. Writes are never
coalesced or retried.

| Scenario | Before | After |
|---|---:|---:|
| Two concurrent `GET /api/dashboard` calls | 2 fetches | 1 fetch |
| Same GET after completion | New fetch | New fetch |

### Cross-identity stale asynchronous state — high

An old badge request could resolve after an identity change, and pending GETs
were not explicitly invalidated by authentication changes. Authentication
mutations and deletion now clear pending GETs; HTTP 401 clears user, CSRF, cache
and pending GET state; badge refresh refuses to publish if the user ID changed.
This prevents cross-account reuse without weakening cookie, CSRF or authorization
controls.

## E. API and async efficiency

- Independent reads already use `Promise.all` where safe.
- Searches submit once rather than requesting on each keystroke.
- Pagination/filter contracts and ordering are unchanged.
- Mutations remain disabled while pending and are never automatically retried.
- GET coalescing is exact-path, concurrent and memory-only.
- Render sequence and identity checks prevent stale publication.
- Badge failures stay non-blocking; route failures stay visible.

Badge refresh still loads dashboard and notification preview during authenticated
navigation and once per minute while visible. Longer caching was rejected because
it could reduce freshness and complicate isolation without network evidence.

## F. Listeners, timers and memory

The benchmark observed one-time listeners only: nine document listeners (click,
submit, input, keydown, mouseover/out, focusin/out and change) and two window
listeners (hashchange and resize). None is added during rendering.

Timers are the replaceable toast timeout and one 60-second visible/authenticated
badge interval created during boot. Navigation does not recreate it. No
route-specific timer, unbounded collection or accumulating detached-node
reference was found. Browser heap retention remains unverified.

## G. Lists, searches, CSS and themes

Backend contracts bound or paginate messages, notifications, audit entries,
directory, community and administrator collections. Client filtering processes
bounded results and preserves order. No search requests fire per keystroke.

Responsive CSS uses grid/flex reflow and bounded overflow; JavaScript does not
continuously calculate layout. Geometry measurement occurs only for collapsed
sidebar tooltip entry. Reduced-motion support remains intact. Theme initialization
and switching use root attributes and validated local preferences without a
route render, except the settings view rerender needed to update selected state.
Sky Blue, Classic Golden and system/light/dark behavior are unchanged.

## H. Reproducible benchmark

Run `npm run benchmark:frontend`. It warms operations, reports average/p95,
inventories asset bytes/listeners and counts mocked fetch invocations. Timings
are reports, not brittle pass/fail thresholds.

| Measurement | Baseline | Optimized run |
|---|---:|---:|
| Concurrent identical GET fetches | 2 | 1 |
| Layout, 500 iterations avg / p95 | 0.0916 / 0.1363 ms | 0.0976 / 0.1525 ms |
| 500-course catalogue, 100 iterations avg / p95 | 5.3780 / 5.9627 ms | 6.0004 / 7.3111 ms |

Template/list differences are ordinary VM variability; no speedup is claimed.
The deterministic request-count reduction is the only optimized metric.

## I. Regression and operational evidence

- Complete suite: 152 passed, zero failed/skipped/todo.
- Frontend suite: 61 passed.
- Syntax: 79 JavaScript files passed.
- API inventory: 94 unique routes, unchanged.
- Dependency audit: zero vulnerabilities.
- Disposable migrations: `0001`–`0003`, valid checksums/schema, zero pending,
  integrity `ok`, foreign keys enabled, zero violations.
- Backup/restore: 71 pages, integrity `ok`, migration `0003` retained.
- Isolated HTTP: document/app/CSS/theme assets 200; unauthenticated dashboard
  401; legacy login and authenticated dashboard 200; CSRF issued.
- Temporary listener and disposable data directory were removed.

## J. Browser limitations and remaining debt

**REAL-BROWSER PERFORMANCE: NOT VERIFIED**

Not measured: FCP, LCP, INP, CLS, heap, paint/layout, frame rate, real devices,
compression/cache behavior or network latency. Deployment-boundary compression
and minification may later help, but no bundler/source split is justified without
delivery evidence. Periodic badges remain the main repeated read workload;
production observability should determine whether future throttling or a smaller
aggregate endpoint is warranted.

## K. Final assessment

| Area | Assessment |
|---|---|
| Initial-load source review | PASS |
| Routing and stale-render protection | PASS |
| Concurrent GET efficiency | PASS after correction |
| Cross-identity async isolation | PASS after correction |
| Listener/timer lifecycle | PASS at source and VM level |
| List/search processing | PASS for controlled local evidence |
| CSS/theme source efficiency | PASS |
| Real-browser performance and Web Vitals | NOT VERIFIED |

**APPLICATION QA PHASE 3 COMPLETE — AUTOMATED AND SOURCE-LEVEL SCOPE**

This is not a production-performance claim. Next, capture Web Vitals, network
waterfalls, heap snapshots and real-device behavior through an approved browser.
