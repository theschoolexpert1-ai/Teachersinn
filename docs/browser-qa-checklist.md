# TeachersInn manual browser QA checklist

Automated browser access was unavailable during Phase 14. Use this checklist
in staging with disposable educator and administrator accounts. Record browser
name/version, operating system, viewport, theme, color mode, result, screenshot
reference, and defect ID for every run.

## Viewport matrix

Run every critical page at 320, 375, 390, 768, 1024, 1280, and 1440 CSS
pixels. Check Sky Blue and Classic Golden in light and dark mode; confirm system
mode follows an operating-system color change.

| Area | Pages and interactions | Visual checks |
|---|---|---|
| Authentication | Register, login, logout, login again, invalid credentials | labels, errors, focus order, protected-route redirect |
| Dashboard | statistics, course progress, workshops, CPD, notifications, actions | card wrapping, no clipping/overflow |
| Courses | catalogue, filters, details, enrollment, lessons, certificate and print | progress accuracy, locked state, print layout |
| Workshops | search, details, register, calendar export, cancel | action wrapping and status clarity |
| Network/messages | directory, profile, requests, conversations, composer | mobile conversation navigation, unread state |
| Career | overview, CV edit/save/preview/print, jobs, applications | form alignment and A4 print output |
| Community | feed, create, reply, filters | long-content wrapping and empty state |
| Planner | overview, builder, duplicate, calendar, detail and print | calendar at 320px and A4 output |
| Notifications | bell, popover, activity filters, read actions | placement and unread synchronization |
| Administrator | overview and all management/operations pages | table scroll, filters, reachable actions |
| Settings | every section, appearance, preferences, sessions | focus order, feedback, narrow forms |

The sidebar must measure 260px expanded and 72px collapsed on desktop. At the
mobile breakpoint verify drawer opening, focus visibility, outside-click and
Escape closure, and that background controls are not accidentally activated.

## Teacher journey

1. Register a disposable teacher, log out, and log in again.
2. Verify dashboard values against created records.
3. Enroll in a course, complete lessons once, confirm one certificate, and use
   public certificate verification.
4. Register for and cancel a future workshop; inspect its `.ics` export.
5. With a second teacher, request and accept a connection, exchange messages,
   and verify unread counts and ordering.
6. Save and reopen a CV, inspect templates and print preview, apply once to a
   job, and verify a retry does not duplicate the application.
7. Create a discussion and reply; retry once to verify duplicate protection.
8. Create, edit, duplicate, calendar-view, and print a lesson plan. Confirm the
   second teacher cannot access it.
9. Exercise the notification bell, Activity Center, filters, and read actions.
10. Update profile, privacy, notification, theme, and color-mode settings;
    reload and verify persistence. Review active sessions.

## Administrator journey

Verify dashboard metrics against disposable records. Exercise user search and
filters, course/workshop inventories, attendance transitions and CPD reversal,
job creation/closure, moderation, support status changes, mentorship privacy,
7/30/all analytics, and read-only newest-first audit search/pagination. Confirm
the educator account receives 403 for every administrator route.

## Keyboard and assistive technology

- Traverse with Tab and Shift+Tab; focus must remain visible and follow visual
  order. Activate native controls with Enter/Space.
- Verify Escape closes the mobile drawer, notification popover, and dialogs and
  returns focus where appropriate.
- Confirm landmarks/headings form a useful screen-reader outline; every input
  has a programmatic label, errors are announced, and live status is concise.
- Test at 200% zoom, Windows High Contrast, reduced motion, and with an actual
  screen reader. This checklist is not WCAG certification.

## Theme and contrast evidence

Phase 14 representative text/button calculations ranged from 4.58:1 to
17.89:1. Browser testing must still check hover, disabled, validation, chart,
badge, and focus states. Confirm first paint is Sky Blue with no Golden flash,
invalid stored values fall back to Sky Blue, and saved Classic Golden persists.
