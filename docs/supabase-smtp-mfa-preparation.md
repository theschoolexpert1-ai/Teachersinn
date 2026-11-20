# TeachersInn Brevo SMTP and Supabase TOTP MFA preparation

This is preparation only. SQLite and legacy authentication remain active. No SMTP setting, cloud project, Auth user, active `.env`, route, database, or deployed application was changed.

## Authentication architecture audit

Legacy authentication uses application-owned scrypt password hashes, random 256-bit session values with only SHA-256 hashes persisted, idle and absolute expiry, account lockout, generic credential errors, HttpOnly `SameSite=Strict` cookies, origin validation, synchronizer CSRF tokens, role checks, and immediate suspended-account session rejection. It has no portable Supabase session or MFA factor.

The dormant Supabase bridge uses the public key for user Auth operations and the server-only secret for authoritative `account_settings` and legacy identity mapping. Access and refresh tokens are encrypted and authenticated inside an HttpOnly cookie; browser persistence and URL session detection are disabled. Refresh is serialized, recovery responses do not reveal account existence, password reset signs out globally, and account role/status is read server-side. Supabase Auth remains disabled by `AUTH_BACKEND=legacy`; data remains SQLite.

SMTP is required for signup confirmation, account activation, password recovery, secure email changes, and security notices. TOTP MFA requires an authenticated Supabase session, factor enrollment, challenge/verification, AAL evaluation, factor management, step-up enforcement, and a reviewed lost-device process. Neither feature should depend on SQLite-stored TOTP material.

## Brevo SMTP requirements

Proposed sender:

- Host: `smtp-relay.brevo.com`
- Port: `587` with STARTTLS as the preferred submission port; Brevo also supports 465 and 2525
- Username: the exact SMTP login shown in Brevo Settings → SMTP & API; it may be the account login or an assigned `...@smtp-brevo.com` identifier
- Password: a Brevo SMTP key, not a Brevo API key
- Sender email: `no-reply@auth.schoolexpert.in`
- Sender display name: `TeachersInn`
- Domain: authenticate the sender domain in Brevo and publish the supplied DKIM/domain-verification records; establish an appropriate DMARC policy and confirm SPF alignment according to the DNS/provider design

Credentials belong in Supabase's encrypted project configuration, not source code, browser code, approval JSON, logs, or the application `.env`. Restrict Brevo and Supabase dashboard access, name and rotate SMTP keys, and record key ownership without recording the key value.

## Manual configuration steps — not executed

1. In Brevo, activate transactional email, open Settings → SMTP & API, and authenticate the sender domain for `no-reply@auth.schoolexpert.in` using the DNS records Brevo supplies.
2. Confirm DKIM/domain authentication and create or validate the TeachersInn sender. Generate a dedicated SMTP key and copy the displayed SMTP login separately. Do not use the relay host as the username and do not use an API key as the password.
3. In Supabase project `ivnmrhwxdawmzaakdhec`, open Authentication settings → Custom SMTP. Enable custom SMTP only during a separately approved configuration window.
4. Enter the Brevo host, approved port/TLS mode, SMTP login, SMTP key, `TeachersInn`, and `no-reply@auth.schoolexpert.in`. Never paste these values into repository files.
5. Keep email confirmation enabled. Verify the exact Site URL and redirect allow-list for the TeachersInn origin.
6. Review confirmation, recovery, invite, email-change, and security templates. Confirmation/recovery links must use short-lived `TokenHash` verification routed through the existing server-managed bridge; access and refresh tokens must never appear in URLs or logs.
7. Review Supabase Auth email rate limits, Brevo quota/rate limits, bounce/complaint handling, suppression state, and alerting before testing.
8. With separately authorized disposable identities and inboxes, test delivery, DKIM/SPF/DMARC results, confirmation, recovery, invalid/expired/reused links, generic recovery responses, throttling, bounce handling, and cleanup. Do not weaken confirmation to make tests pass.

Supabase's default SMTP is development-only and materially restricted. Custom SMTP is required before real users or non-team recipients are used. See [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Brevo SMTP setup](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP), and [Brevo SMTP troubleshooting](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP).

## Server-side TOTP MFA design

`src/auth/supabase-mfa.js` is a dormant service boundary using the installed Supabase MFA API. It establishes the server-held Auth session before every operation and provides:

- `status`: safe verified-factor metadata plus current/next Authenticator Assurance Level;
- `enroll`: TOTP enrollment with a QR data image; the raw TOTP secret and `otpauth` URI are deliberately omitted from returned/loggable objects;
- `verify`: validates a six-digit code through `challengeAndVerify` and returns the rotated AAL2 session for the bridge to reseal in the HttpOnly cookie;
- `assurance` and `requireAal2`: authoritative server-side AAL checks;
- `remove`: factor ownership through the user session, AAL2, current-password reauthentication, and other-session revocation.

Future login behavior:

1. Verify email/password to obtain AAL1.
2. Resolve authoritative active account and legacy mapping.
3. Call `getAuthenticatorAssuranceLevel` and `listFactors` server-side.
4. If current AAL is `aal1` and next is `aal2`, store only a short-lived `mfa_pending` HttpOnly session and require TOTP challenge/verify.
5. Reseal the rotated session only after successful verification. Deny protected/admin operations until the server observes `currentLevel=aal2`.
6. For administrators, require both authoritative `account_settings.role='admin'` and AAL2. Frontend state, user metadata, and a claimed role never satisfy this policy.
7. Refresh and logout continue through the server bridge. Global logout, password reset, suspension, factor changes, and recovery revoke or invalidate relevant sessions.

TOTP is enabled by Supabase, but enforcement is application policy. Database functions handling high-risk operations should additionally inspect the trusted JWT AAL claim where appropriate so bypassing HTTP presentation cannot bypass MFA. See [Supabase TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp) and [Supabase MFA concepts](https://supabase.com/docs/guides/auth/auth-mfa).

## Future Settings interface

`src/auth/mfa-ui.js` prepares the future Profile → Settings → Security → Two-Factor Authentication panel using existing settings-card conventions. It includes status, enable, QR scan, one-time-code input, verification, management, disable, reauthentication, and recovery guidance. It is not mounted into the active legacy interface and adds no route.

The QR code is accepted only as a Supabase SVG data image, treated as sensitive, displayed only during pending enrollment, never logged or persisted, and removed from UI state after success/cancel. TOTP secrets are never stored in SQLite. Disable requires server-side AAL2 and password reauthentication, not only a confirmation dialog.

## Lost-device and recovery policy

Prefer enrollment of another supported factor before removing the last usable factor. If no usable factor exists, do not add an application bypass. A trained support/identity owner must complete a documented, privacy-preserving identity review, use separately authorized Supabase administrative recovery, revoke existing sessions, remove only the verified user's lost factor, notify the account through a verified channel, and require fresh password plus MFA enrollment. Administrator recovery requires two-person approval. Every recovery is audited without recording codes, secrets, tokens, or private evidence.

Supabase recovery-code APIs in the installed client are experimental and require explicit server support; they are not part of the current activation plan. Do not promise or enable them without a separate review.

## Isolated development test plan

Use only the development project, disposable Auth users, dedicated inboxes, and separately approved email/MFA mutation gates. Confirm project identity and empty/expected data first.

Test signup, confirmation and login; recovery delivery/reset/link expiry/replay; TOTP enrollment/QR lifetime; valid, invalid, expired and replayed TOTP codes; rate limiting; AAL1→AAL2 rotation; login challenge; refresh/logout/global revocation; safe factor listing; password+AAL2 factor removal; suspended user denial; administrator role+AAL2 enforcement; cross-user factor denial; lost-device process; audit redaction; and scoped cleanup. Failed or skipped email/MFA tests are never reported as passed.

## Security findings and remaining work

- Existing cookie, CSRF, origin, suspension, rate-limit, and server-side authorization foundations are suitable but must be retested after routing MFA operations.
- `AUTH_COOKIE_SECRET`, Supabase server secret, SMTP login/key, access/refresh tokens, QR data, TOTP secret, and recovery evidence are server-only sensitive values.
- AAL must be checked on each high-risk request, not cached in localStorage or inferred from UI state.
- Factor removal and lost-device recovery are privilege-changing operations requiring reauthentication, audit, session revocation, and rate limits.
- The dormant MFA service is not connected to HTTP routes by this preparation phase. The existing 98 contracts and active UI are unchanged.
- Manual Brevo domain authentication, SMTP setup, templates, real delivery, Supabase MFA policy configuration, disposable cloud tests, recovery ownership, and cutover authorization remain pending.
