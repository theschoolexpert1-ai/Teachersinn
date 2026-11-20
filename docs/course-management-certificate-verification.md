# Course Management and Certificate Verification

## Implemented scope

TeachersInn administrators can create a draft course, edit its metadata,
replace its ordered lesson curriculum before enrollment, publish or unpublish
it, preview it, and archive it. The implementation extends the existing native
Node.js service/repository architecture and SQLite database; it does not change
the active legacy authentication or SQLite backends.

Migration `0004_course_management` adds description, thumbnail, objectives,
prerequisites, estimated duration, lifecycle status and update time to
`courses`. Existing published records are preserved and backfilled. Lesson
positions are unique within a course.

Lifecycle behavior:

- Draft and archived courses are absent from public discovery.
- Publishing requires at least one valid lesson.
- `published`, `draft`, and `archived` states are synchronized with the legacy
  `published` flag.
- Once any teacher has enrolled, wholesale curriculum replacement is rejected
  with HTTP 409. Metadata can still be corrected, and the course can be
  unpublished or archived. This protects progress and certificate history.
- Enrolled teachers retain course access after unpublishing or archival;
  teachers who were not enrolled cannot newly discover or enroll.
- All course-management endpoints require the administrator role and normal
  CSRF/origin protections. Lifecycle changes are written to the audit log.

## Public certificate verification

The canonical public entry point is:

`https://teachersinn.schoolexpert.in/verify`

A certificate link uses only its opaque verification code:

`https://teachersinn.schoolexpert.in/verify?code=TIN-...`

`PUBLIC_APP_ORIGIN` may override the canonical origin for an approved
environment. It must be a bare HTTP(S) origin and belongs in environment or
secret management, never in committed active `.env` files. `APP_ORIGIN` remains
the separate CSRF origin setting.

The direct path is served by the SPA fallback and normalized to the existing
hash router. The verification screen shows the educator name, course,
completion date, CPD hours, certificate code, issuer and verified state. It
offers print and copy-link actions. The public API deliberately omits email,
internal user IDs, enrollment IDs and other private account fields. Invalid
codes return a generic not-found response.

Certificates in the authenticated teacher view now include the canonical
public URL, preview/print controls and a copy action.

## API contracts

Administrator-only additions:

- `GET /api/admin/courses/:id`
- `PUT /api/admin/courses/:id`
- `PUT /api/admin/courses/:id/lessons`
- `POST /api/admin/courses/:id/status`

The existing `POST /api/admin/courses` creates drafts by default and accepts a
validated curriculum. The existing public
`GET /api/certificates/verify/:code` remains the verification API.

## Verification evidence

The automated integration scenario uses a disposable database and verifies
administrator authorization, draft invisibility, publish prerequisites,
catalog visibility, enrollment, curriculum locking, completion and issuance,
archival access, anonymous verification, response privacy, invalid codes and
direct `/verify` HTML delivery. Run the complete suite with:

```text
npm test
```

## Manual browser checklist

These checks are required on a disposable staging database before release and
remain **NOT VERIFIED** until somebody records the browser, viewport and result:

1. Sign in as an administrator and create a draft with complete metadata.
2. Add, reorder and save lessons; confirm validation errors are understandable.
3. Confirm a draft is absent for an unrelated teacher, then publish it and
   confirm it appears in catalogue search and filters.
4. Enroll a disposable teacher, complete every lesson and print the certificate.
5. Open its canonical verification URL in a private window and confirm the
   verified design and safe fields at desktop and mobile widths.
6. Try an invalid code and confirm the safe failure state.
7. Archive the course; confirm the enrolled teacher retains access while a new
   teacher cannot discover or enroll.
8. Verify Classic, Sky Blue and dark-mode presentation, keyboard focus,
   reduced-motion behavior and A4 printing.

Do not perform these checks against the production database or real teacher
accounts. Back up and review the exact target before applying migration `0004`.
