# TeachersInn UI accessibility and responsive audit

## A. Scope

Phase 2 stabilizes existing UI behavior, responsive source rules, keyboard
interaction, form semantics, modal/dropdown behavior, themes and reduced-motion
support. It uses source inspection and the existing Node/VM test infrastructure.
No backend, route, payload, migration, database, authentication backend, theme
identity or application feature was changed.

**REAL-BROWSER VERIFICATION: NOT VERIFIED**

The approved browser automation path remains unavailable because the Windows
safety layer could not reliably determine Chrome's current URL. Pixel-level
layout, visual contrast, native browser behavior, screen-reader output and real
keyboard traversal are therefore not classified as passed.

## B. Baseline

- Initial regression suite: 146 passed, zero failed or skipped.
- Initial frontend suite: 55 passed.
- Backend inventory: 94 unique method/path routes.
- Client router: 37 registered route patterns plus the implicit root landing
  route, representing the 38 previously audited route entries.
- Active configuration remains SQLite with legacy authentication.

## C. Screen inventory

The Phase 1 screen/API inventory was rechecked. Public authentication,
confirmation, recovery, certificate verification and legal screens; all
teacher dashboard, learning, workshop, career, network, message, community,
notification, planning, tutorial, support, mentorship, profile and settings
screens; and administrator overview, analytics, user, course, job, workshop,
attendance, audit, support, moderation and mentorship screens remain present.
The inventory contains 37 registered route patterns plus the router's implicit
root login/landing surface, preserving the 38 Phase 1 user-visible entries.

The common authenticated layout provides sidebar navigation, top bar, theme
selector, notification popover, profile link, main landmark and footer. Public
screens use the existing landing layout. Data screens retain their loading,
empty, failure and successful-mutation states.

## D. Functional reliability

- All 35 actions and 36 forms remain uniquely registered.
- Delegated buttons/forms prevent repeated activation while awaiting promises.
- Success feedback follows, rather than precedes, successful mutations.
- Failed submissions preserve form values and restore the submit control.
- Render sequence protection prevents stale route responses replacing newer
  navigation.
- Native inputs, links, buttons and selects are retained; no custom widget
  framework or conflicting ARIA menu pattern was introduced.
- Notification popover outside-click and Escape behavior remain intact.

## E. Responsive CSS

The stylesheet contains layout transitions at 1180, 1100, 1080, 1000, 900,
860, 850, 760, 700, 620, 480 and 390 pixels. These rules collectively cover the
requested 320, 375, 430, 768, 1024, 1366 and 1920 review targets without adding
device-specific breakpoints.

Inspected patterns include single-column card/grid reflow; bounded modal height
and scrolling; horizontal tab, navigation and table overflow; mobile attendance
row transformation; full-width form controls; message-panel switching; sticky
composer behavior; drawer/backdrop sizing; and print-only layouts. No confirmed
source-level page overflow defect remains. Actual rendered breakpoints are not
verified.

## F. Accessibility findings and corrections

### Modal focus lifecycle — high

Root cause: dialogs moved focus to the first input but did not contain Tab focus
or remember the invoking element. Escape/backdrop/close could leave focus in an
undefined location.

Correction: dialogs now use `aria-modal`, `aria-labelledby`, a focusable dialog
fallback, first-control focus, forward/reverse Tab containment, and focus
restoration on close. Route-driven teardown intentionally suppresses obsolete
focus restoration.

### Mobile drawer state and focus — high

Root cause: the menu button had no `aria-expanded`/`aria-controls`; the closed
off-canvas sidebar remained keyboard reachable; opening did not move focus;
background content remained exposed.

Correction: the menu reports state and ownership, the closed mobile sidebar is
`inert`, opening moves focus into navigation and contains Tab focus, the main
surface becomes inert while open, and Escape/backdrop close restores the menu
button. Resize synchronization removes mobile inertness on desktop.

### Dynamic form labels — medium

Root cause: several dynamically rendered forms used sibling `<label>` and
control elements without explicit association. The text was visible but not a
reliable accessible name.

Correction: the existing DOM enhancement pass assigns stable generated IDs and
`htmlFor` only to unassociated sibling labels. Native wrapping labels and
existing explicit IDs remain unchanged.

### Form error focus and announcement — medium

Root cause: `.form-error` text became visible but generic forms did not
consistently expose an alert role or move focus to the actionable error.

Correction: failed submissions now set `role="alert"`, make the error
programmatically focusable, and focus it. The next submission removes the
temporary tab stop. Values and validation rules are unchanged.

### Route focus and live-region scope — medium

Root cause: route changes did not establish a keyboard/screen-reader focus
target, while the entire application root was a polite live region and could
announce excessive rerendered content.

Correction: each completed route render focuses its first `h1` without
scrolling. The broad application live region was removed; the dedicated polite
toast status region remains. Active generic tabs now expose `aria-current`.

## G. Forms and semantics

All 36 forms retain native controls, names, types, required attributes, length
bounds and backend payloads. Existing explicit labels and visually hidden
labels were preserved. The new association pass covers sibling labels in
modal/settings/administrative forms. Errors are visible, announced and focused;
submit buttons are restored in `finally`; password mismatch remains blocked
before transmission.

The authenticated shell retains `main`, labelled navigation, header/footer,
native table headers and labelled icon buttons. Progress controls expose ARIA
minimum, maximum and current values. Decorative icons remain hidden where
implemented. Complete heading-order and screen-reader speech verification
requires manual browser QA.

## H. Navigation, dialogs and menus

- Desktop sidebar collapse/expand, persistence, active state and focus-triggered
  tooltips remain unchanged.
- Mobile drawer now has explicit state, focus containment and background
  isolation without changing desktop dimensions or appearance.
- Dialog semantics and focus lifecycle are corrected without redesign.
- Theme/appearance/filter controls remain native selects.
- Generic tab navigation now exposes the selected page to assistive technology.
- Notification popover retains labelled button state and Escape focus return.
- Browser history and native confirmation-dialog behavior are not verified.

## I. Themes, focus and motion

Sky Blue remains the default; Classic Golden remains optional. System, light
and dark modes and local persistence are unchanged. Components continue to use
theme tokens. Global `:focus-visible` and form-control focus rules remain in
place across themes.

The existing `prefers-reduced-motion: reduce` rule reduces transition and
animation durations, stops repeated animation and disables smooth scrolling.
No application action depends on animation. Static token inspection is not a
WCAG contrast certification; manual measurement is required.

## J. Automated test evidence

Meaningful regression coverage was added for:

- dynamically associated sibling labels;
- dialog naming, initial focus and invoker focus restoration;
- mobile navigation ownership/state/inert/focus safeguards;
- route heading focus;
- scoped status/error announcements;
- reduced-motion preservation;
- the existing unique action/form and API contract guarantees.

Final evidence on 2026-11-18:

- 149/149 complete automated tests passed; zero failed or skipped;
- 58/58 frontend tests passed;
- 78 JavaScript files passed syntax checks;
- all 94 API routes remained unique and unchanged;
- a disposable database applied migrations `0001`–`0003`, reported valid
  checksums/schema, integrity `ok`, foreign keys enabled and zero violations;
- online backup/restore verification copied 71 pages and retained version
  `0003` with integrity `ok`;
- isolated HTTP returned 200 for the document, JavaScript, CSS and theme
  initializer, 401 for an unauthenticated dashboard, and 200 after disposable
  administrator login with a CSRF token;
- the high-severity dependency audit reported zero vulnerabilities; and
- the validation listener and temporary database directory were removed.

## K. Manual browser QA

The executable checklist is
[`ui-manual-qa-checklist.md`](ui-manual-qa-checklist.md). It covers all target
viewports, public/teacher/admin screens, keyboard commands, screen readers,
zoom/text spacing, themes, contrast, reduced motion, visual overflow, native
downloads/printing and browser history. No row is premarked as passed.

## L. Unverified items and assessment

| Area | Assessment |
|---|---|
| Source-level functional reliability | PASS |
| Automated accessibility safeguards | PASS |
| Responsive CSS coverage | PASS at source level |
| Backend/API compatibility | PASS |
| Pixel-level responsive rendering | NOT VERIFIED |
| Real keyboard traversal | NOT VERIFIED |
| Screen-reader output | NOT VERIFIED |
| Measured contrast/WCAG conformance | NOT VERIFIED |
| Browser history, downloads, print and native dialogs | NOT VERIFIED |

No unresolved critical or high-severity defect remains within the automated and
source-level scope.

**UI QA PHASE 2 COMPLETE — AUTOMATED AND SOURCE-LEVEL SCOPE**

This status is not a claim of WCAG conformance, real-browser correctness or
production readiness. The next phase should execute the manual checklist using
supported browsers, assistive technology and physical/mobile viewports before
staging operational validation.
