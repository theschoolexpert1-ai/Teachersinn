# TeachersInn manual UI QA checklist

Use this checklist only with a disposable development database and test
identities. Do not use production data. Do not premark a result: record one of
`PASS`, `FAIL`, `BLOCKED`, or `NOT VERIFIED` after performing each check.

## Milestone 5 safe startup

Use a new workspace-scoped directory and process-level variables. Do not edit
`.env`, and do not point `TEACHERSINN_DATA_DIR` at `data`.

```powershell
$testData = Join-Path (Get-Location) '.manual-browser-qa-data'
if (Test-Path -LiteralPath $testData) { throw 'Choose a new disposable path' }
New-Item -ItemType Directory -Path $testData | Out-Null
$env:HOST = '127.0.0.1'
$env:PORT = '4317' # first verify this port is free
$env:APP_ORIGIN = 'http://127.0.0.1:4317'
$env:TEACHERSINN_DATA_DIR = $testData
$env:DATA_BACKEND = 'sqlite'
$env:AUTH_BACKEND = 'legacy'
$env:ADMIN_EMAIL = 'browser-admin@test.local'
$env:ADMIN_PASSWORD = '<unique disposable password>'
$env:COOKIE_SECURE = '0'
$env:TRUST_PROXY = '0'
npm start
```

Open the exact URL printed by the server. Confirm the database path is the new
disposable directory before submitting forms. The seeded administrator uses the
email/password supplied above. Create teacher identities only in this isolated
instance. After testing, stop the server, verify the listener is closed, resolve
the absolute disposable path, confirm it is inside this workspace and named
`.manual-browser-qa-data`, then remove it. Never reuse real credentials or put
test passwords in screenshots or reports.

### Milestone 5 executed subset (2026-11-18)

| Check | Browser / viewport | Status | Evidence / notes |
|---|---|---|---|
| Isolated login and authenticated dashboard | Chrome / approximately 1042×841 | PASS | Disposable SQLite; exact loopback URL; labelled form and dashboard rendered |
| Learning catalogue and course detail | Chrome / approximately 1042×841 | PASS | Sidebar navigation, cards, enrollment success and lesson/progress UI |
| Administrator overview | Chrome / approximately 1042×841 | PASS | Direct authenticated route, metrics and admin navigation rendered |
| Sky Blue and Classic selection | Chrome / approximately 1042×841 | PASS | Both rendered; Classic persisted after reload |
| Refresh and Back history | Chrome / approximately 1042×841 | PASS | Session/route restored; Back returned to enrolled catalogue state |
| Logout and Back protection | Chrome / approximately 1042×841 | PASS | Private admin content did not return at protected hash |
| Cross-browser and canonical viewport matrix | Environment | BLOCKED | Only Chrome and one fixed window were safely available |
| Screen reader, DevTools profiling, printing/downloads | Environment | BLOCKED | Approved session exposed no screen reader/profiling/output harness |

This executed subset does not premark any unexecuted row below. See
`browser-qa-report.md` for evidence boundaries.

## A. Test environment

| Field | Value |
|---|---|
| Tester and date | |
| Browser and version | |
| Operating system | |
| Viewport width / zoom | |
| Theme | Sky Blue / Classic Golden |
| Appearance | System / Light / Dark |
| Role | Public / Teacher / Administrator |
| Disposable account | |
| Build or commit | |

For each failure record:

- Result: `PASS` / `FAIL` / `BLOCKED` / `NOT VERIFIED`
- Screenshot or recording reference
- Exact route and viewport
- Reproduction steps
- Expected and actual behavior
- Severity: critical / high / medium / low
- Browser console or network evidence, with secrets removed

## B. Responsive viewport matrix

At each width, test at 100% zoom, then repeat essential navigation at 200% zoom.
Do not rely only on device emulation when a physical device is available.

| Width | Category | Result | Evidence / notes |
|---:|---|---|---|
| 320px | Small mobile | | |
| 375px | Mobile | | |
| 430px | Large mobile | | |
| 768px | Tablet portrait | | |
| 1024px | Tablet landscape | | |
| 1366px | Laptop | | |
| 1920px | Desktop | | |

For every width verify no page-level horizontal overflow, clipped controls,
overlapping text, inaccessible sticky content, or off-screen dialogs. Confirm
cards reflow, tables scroll or transform correctly, forms remain usable, and
touch targets are reachable without precision gestures.

## C. Public screens

| Route / screen | Checks | Result | Evidence / notes |
|---|---|---|---|
| `#/` Login | Labels, password autocomplete, validation, pending state, error focus, successful redirect | | |
| `#/register` Registration | Required/consent communication, preserved input on error, duplicate-account feedback | | |
| `#/forgot-password` Recovery | Email label/type, neutral response, pending/error state | | |
| `#/confirmation-sent` | Heading focus and meaningful next action | | |
| `#/confirm` | Valid, invalid and expired token states | | |
| `#/reset-password` | Link validation, password constraints, successful redirect | | |
| `#/verify/:code` | Valid and missing certificate states; no private data | | |
| `#/legal` | Heading order, readable line lengths and keyboard links | | |

## D. Teacher screens

| Route / area | Checks | Result | Evidence / notes |
|---|---|---|---|
| Dashboard | Heading focus, CPD progress name/value, cards, empty/error states, quick actions | | |
| Learning catalogue | Search/filter keyboard access, card reflow, empty state | | |
| Course and lesson | Preview/locked states, enrollment, progress, lesson navigation | | |
| Certificates | List, detail, print control and verification link | | |
| Workshops | Filters, capacity, register/cancel, attendance states, calendar download | | |
| Careers / jobs | Profile/CV form, job filters/detail, application confirmation/history | | |
| Network | Search, connection states, request acceptance/decline/removal | | |
| Messages | Conversation list, mobile thread/back flow, composer, new messages | | |
| Community | Filters, creation dialog, reply form, ownership controls, empty state | | |
| Notifications | Bell/popover, filters, read/read-all, count refresh and navigation | | |
| Lesson planner | CRUD, duplicate, templates, calendar, print layout | | |
| Tutorials | Search, detail, related items, save/unsave persistence | | |
| Support | Ticket creation dialog, list/detail, replies and status | | |
| Mentorship | Discovery, request dialog and relationship transitions | | |
| Profile | Labels, save failure preservation, privacy and password controls | | |
| Settings | All eight sections, native selectors, toggles, export and deletion warning | | |

## E. Administrator screens

Use an administrator and repeat direct URLs with an ordinary teacher to prove
the backend returns an authorization failure.

| Route / area | Checks | Result | Evidence / notes |
|---|---|---|---|
| Overview | Metrics, quick actions, empty lists and responsive cards | | |
| Analytics | Period controls, selected state and metric wrapping | | |
| Users | Search/filter, table scrolling, detail, role/status controls, confirmations | | |
| Courses | Table headers, create dialog, errors and success navigation | | |
| Jobs | Listing table, create dialog, close action and confirmation | | |
| Workshops | Cards, create/delete actions and registered counts | | |
| Attendance | Workshop selector, filters, mobile row labels and status changes | | |
| Audit log | Search, pagination, long-value wrapping and privacy | | |
| Support | Filters, table controls, status/priority changes and feedback | | |
| Community | Moderation table and removal confirmation | | |
| Mentorship | Relationship table, statuses and private-data boundary | | |

## F. Keyboard testing

Perform without a mouse.

| Check | Expected behavior | Result | Evidence / notes |
|---|---|---|---|
| `Tab` / `Shift+Tab` | Logical order; focus always visible | | |
| `Enter` / `Space` | Native links/buttons activate correctly | | |
| Route transition | New screen heading receives focus without unexpected scrolling | | |
| Form failure | Error is announced/focused; entered values remain | | |
| Modal open | Focus enters the first useful control | | |
| Modal `Tab` cycle | Focus remains inside the dialog | | |
| Modal `Escape` / close | Dialog closes and invoking control regains focus | | |
| Mobile drawer open | Expanded state changes and focus enters navigation | | |
| Mobile drawer `Tab` cycle | Background cannot receive focus | | |
| Drawer `Escape` / backdrop | Drawer closes and menu button regains focus | | |
| Notification popover | Button state changes; Escape closes and restores focus | | |
| Native selects/radios | Arrow keys and Space follow browser conventions | | |
| Collapsed sidebar | Every icon is reachable and has an accessible name/tooltip | | |
| No traps | Focus can leave every non-modal component | | |

## G. Accessibility checks

| Check | Result | Evidence / notes |
|---|---|---|
| Landmarks (`main`, labelled navigation, header/footer) are announced | | |
| One meaningful page `h1`; headings follow a useful hierarchy | | |
| Inputs expose visible labels or equivalent accessible names | | |
| Required fields and validation are announced without color alone | | |
| Icon-only buttons expose accurate names and state | | |
| Active navigation exposes `aria-current` | | |
| Progress bars expose name, minimum, maximum and current value | | |
| Tables announce headers and remain usable at zoom/mobile widths | | |
| Toasts are polite; form failures are assertive without duplicate announcements | | |
| Dialog name, modality, focus containment and restoration are correct | | |
| User-generated content is read as text, not executable markup | | |
| Screen reader does not enter the closed mobile drawer | | |
| At 200% and 400% zoom, content reflows without losing functionality | | |
| Text spacing overrides do not clip or overlap content | | |
| Windows High Contrast / forced colors retains essential controls | | |

Test at least one current version of NVDA or another supported screen reader.
Record the screen reader and speech/browse mode used.

## H. Themes, contrast and motion

Repeat representative public, teacher and administrator screens under all six
theme/appearance combinations.

| Check | Result | Evidence / notes |
|---|---|---|
| Sky Blue × light / dark / system | | |
| Classic Golden × light / dark / system | | |
| First-time default is Sky Blue | | |
| Theme and appearance persist after reload | | |
| Focus rings remain visible on every surface | | |
| Text, borders, errors, disabled states and controls have usable contrast | | |
| Color is not the only status indicator | | |
| `prefers-reduced-motion: reduce` removes nonessential movement | | |
| No workflow depends on animation | | |

Use a contrast measurement tool for suspected failures. Static token review is
not sufficient to certify WCAG contrast conformance.

## I. Visual and interaction QA

| Check | Result | Evidence / notes |
|---|---|---|
| No unexpected page-level horizontal scrollbar | | |
| Long names, emails, titles and messages wrap safely | | |
| Cards and action rows align at all target widths | | |
| Sticky headers/composers do not hide content | | |
| Dialog remains centered, scrollable and fully reachable | | |
| Notification dropdown stays within the viewport | | |
| Administrator tables preserve essential controls | | |
| Mobile drawer covers content predictably and backdrop fills viewport | | |
| Empty/loading/error/success states are visually distinct | | |
| Native print and download flows complete as expected | | |

## J. Browser history and persistence

| Check | Result | Evidence / notes |
|---|---|---|
| Deep links restore the intended authenticated screen | | |
| Back/forward moves through hash history without loops | | |
| Refresh restores the session and current route | | |
| Expired/revoked session returns to login safely | | |
| Logout prevents returning to protected data via Back | | |
| Theme, appearance and sidebar preferences persist | | |
| Failed form values remain where correction is expected | | |

## K. Completion summary

| Severity | Open defects | References |
|---|---:|---|
| Critical | | |
| High | | |
| Medium | | |
| Low | | |

Overall manual result: `PASS` / `FAIL` / `BLOCKED` / `NOT VERIFIED`

Milestone 5 result: `BROWSER QA PARTIALLY COMPLETE` (limited real Chrome checks
passed; required browser/viewport/accessibility/output coverage remains open).

Tester sign-off and date:

