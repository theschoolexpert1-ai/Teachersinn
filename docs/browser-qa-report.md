# TeachersInn Milestone 5 browser QA report

## A. Scope

Milestone 5 targeted real-browser rendering, navigation, authentication,
interaction, accessibility, themes, responsive layouts, output flows and browser
performance. Testing was intentionally isolated from the active `.env` and
`data/teachersinn.db`.

## B. Environment

- Date: 2026-11-18
- Operating system: Windows
- Browser actually tested: Google Chrome (installed desktop browser; exact
  version was not exposed by the approved automation surface)
- Observed browser window: approximately 1042 × 841 logical pixels
- Zoom shown by Chrome before isolated navigation: 110%; canonical 100% viewport
  widths were not established
- Application: `http://127.0.0.1:4317` during the test only
- Backend: legacy authentication and disposable SQLite
- Test identity: isolated seeded administrator; no real user data used

The server used process-level configuration with `HOST=127.0.0.1`, an explicit
port, `TEACHERSINN_DATA_DIR=.milestone5-browser-data`, `DATA_BACKEND=sqlite` and
`AUTH_BACKEND=legacy`. The server and listener were stopped and the disposable
database, WAL and SHM files were removed afterward.

## C. Browser automation availability

The approved Windows computer-use surface returned one unique TeachersInn Chrome
window and exposed its exact address (`localhost:3000/#/messages`). This removed
the earlier URL-identification ambiguity. Navigation to the isolated loopback
instance was then permitted and the exact `127.0.0.1:4317` URL remained visible
throughout the executed checks.

Chrome interaction and accessibility-tree inspection were supported. Edge,
Firefox, Android Chrome, iOS Safari, physical devices, viewport resizing,
DevTools console/network panels, browser profiling and a screen reader were not
available through the approved session. No safety control was bypassed and no
alternative automation package was installed.

## D. Executed tests

| Test | Method | Result | Evidence |
|---|---|---|---|
| Isolated startup and static application load | Real Chrome, disposable server | PASS | Login page rendered at exact loopback URL with CSS, navigation and labelled controls |
| Administrator login | Real Chrome form submission | PASS | Redirected to `#/dashboard`; administrator navigation exposed |
| Dashboard | Visual and accessibility-tree inspection | PASS | Cards, empty states, progress indicators, quick actions and landmarks rendered |
| Learning catalogue | Sidebar navigation and inspection | PASS | Filters and eight course cards rendered; no visible page-level overlap |
| Course enrollment | Real browser mutation on disposable DB | PASS | Success toast; route changed to `#/course/1`; enrolled state persisted |
| Course detail | Visual and accessibility inspection | PASS | Lesson navigation, progress and curriculum exposed with names/values |
| Administrator dashboard | Direct route while authenticated | PASS | Metrics, management links and admin content rendered |
| Theme switching | Native select: Sky Blue to Classic | PASS | Classic warm-gold tokens rendered immediately |
| Theme persistence | Browser reload | PASS | Classic remained selected and rendered |
| Session persistence | Reload authenticated course route | PASS | Session and route restored |
| Browser Back | Chrome Back control | PASS | Course returned to catalogue with enrolled state intact |
| Logout | Real browser button | PASS | Login screen rendered and protected state cleared |
| Back after logout | Chrome Back to `#/admin` | PASS | URL returned to admin hash but only public login content rendered |
| Basic semantic exposure | Chrome accessibility tree | PASS | Main/header/footer/navigation, headings, labels, named buttons and progress values exposed on tested screens |

No destructive operation, password change, account deletion or real-data action
was performed.

## E. Screen coverage

Genuinely tested routes were `#/login`, `#/dashboard`, `#/learn`, `#/course/1`
and `#/admin`, plus the logged-out rendering of protected `#/admin`. The browser
also traversed catalogue/course history. Coverage used Chrome at one observed
desktop-sized window only.

The remaining public, teacher and administrator routes in the 38-entry inventory
were not visually executed in this session. The requested 320, 375, 430, 768,
1024, 1366 and 1920 widths were not established and are **NOT VERIFIED**.

## F. Visual results

The executed login, dashboard, course catalogue, course detail and administrator
screens showed readable typography, aligned cards, visible controls and no
observed page-level overlap or clipping. The administrator section navigation
used an intentional horizontal scrolling strip at the observed width. No visual
defect was confirmed in the executed scope.

Visual results for unexecuted routes, canonical desktop widths, zoom levels,
mobile layouts and other browsers remain **NOT VERIFIED**.

## G. Interaction results

Real form login, sidebar navigation, direct hash navigation, enrollment, native
theme selection, reload, browser Back, logout and protected-history handling all
passed. Forward navigation, representative forms in every module, modals,
drawers, notification popovers, network interruption and server rejection UI
were not executed.

## H. Accessibility

The Chrome accessibility tree exposed labelled email/password controls,
landmarks, useful headings, named links/buttons, progress indicators with values
and status output on tested routes. Route headings visibly received focus after
navigation. Full keyboard-only traversal, Shift+Tab, modal/drawer focus traps,
200%/400% zoom, forced colors and screen-reader speech were not executed.

**SCREEN-READER VERIFICATION: NOT VERIFIED.** No WCAG conformance claim is made.

## I. Themes

Sky Blue rendered on initial isolated login/dashboard screens. Classic Golden
was selected in Chrome, immediately produced warm gold sidebar and accents, and
persisted across reload. Light/dark/system appearance combinations, first-run
storage without prior preferences, contrast measurement and reduced-motion
behavior were not executed in the real browser.

## J. Authentication

Administrator login, authenticated reload, direct administrator access, logout,
state clearing and denial of protected content after browser Back passed using
the disposable identity. Teacher registration/login, expiry, revocation,
suspension and pending-request identity races retain automated coverage but were
not repeated in Chrome.

## K. Printing and downloads

Certificate printing, certificate verification output, calendar downloads,
privacy exports and lesson-plan printing were **NOT VERIFIED** in the browser.
HTTP or automated coverage was not substituted for browser output evidence.

## L. Performance

Real-browser Web Vitals, waterfall, long tasks, memory and cold/warm cache runs
were **NOT VERIFIED** because approved profiling was unavailable. Existing Node
benchmarks remain separate and are not reported as browser measurements.

## M. Defects

No application defect was confirmed in the limited executed scope. One attempted
accessibility-index click targeted an off-screen course action and was rejected by
the automation boundary; the page was reobserved, scrolled and the action then
succeeded. This was a test-harness interaction, not an application defect.

No application code was changed and no regression test was added.

## N. Blocked checks

- Edge, Firefox, Android Chrome and iOS Safari
- Physical mobile devices and canonical viewport widths
- NVDA/VoiceOver speech verification
- DevTools console/network inspection
- Real-browser performance profiling
- Automated print-dialog and download-file verification

These are `BLOCKED` by the available approved environment, not application
failures.

## O. Unverified checks

Unexecuted routes, remaining form workflows, all mobile/drawer behavior, full
keyboard traversal, screen-reader output, appearance combinations, contrast,
printing/downloads, Forward history and browser performance are `NOT VERIFIED`.
See `ui-manual-qa-checklist.md` for the human-executable matrix; unexecuted rows
remain unmarked.

## P. Final assessment

**BROWSER QA PARTIALLY COMPLETE**

Actual Chrome tests passed for a meaningful but limited desktop subset, with no
critical or high-severity defect observed. Required cross-browser, viewport,
screen-reader, output and profiling coverage remains outstanding. This milestone
does not establish full browser acceptance or production readiness.
