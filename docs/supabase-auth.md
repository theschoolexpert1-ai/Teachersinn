# Supabase Auth bridge (Stage B)

## Runtime boundary

`AUTH_BACKEND` defaults to `legacy`. With that default, the existing scrypt passwords, SQLite sessions, cookie name, and API behavior are unchanged. `AUTH_BACKEND=supabase` requires the complete Supabase server configuration, `APP_ORIGIN`, and a random `AUTH_COOKIE_SECRET` of at least 32 characters; missing configuration prevents startup.

The Node server remains the authentication boundary. Supabase access and refresh tokens are held only inside an AES-256-GCM authenticated envelope in an `HttpOnly`, `SameSite=Strict` cookie. Production uses `Secure` and the `__Host-` cookie prefix. The browser receives only the synchronizer CSRF value returned by `/api/me`; it never receives Supabase session tokens.

Expired access tokens are refreshed server-side. Refreshes for the same refresh token share one in-process promise so concurrent requests do not race token rotation. Every request verifies the access token through Supabase Auth and reads `account_settings` authoritatively. Suspended or revoked identities clear the cookie and fail closed.

## UUID-to-SQLite compatibility

Supabase UUIDs are never passed to SQLite queries. A Supabase session may access existing application APIs only when `legacy_user_map` contains an exact `claimed` mapping and all of the following match:

- `auth_user_id` equals the verified Auth UUID.
- `normalized_email` equals the verified Auth email.
- `legacy_user_id` resolves to an active SQLite user.
- The SQLite email equals the verified Auth email.

The authoritative role and status come from `account_settings`, not Auth metadata, the browser, or SQLite. A new confirmed Supabase account without a claimed mapping can complete confirmation or recovery but cannot enter protected SQLite-backed features. This isolation remains necessary until the PostgreSQL data adapter is ready.

## Registration and recovery

Registration uses Supabase Auth and then updates the trigger-created `profiles` and `account_settings` rows through the server-only client. Registration metadata contains only the display name. Role, status, consent timestamp, and consent version are server-controlled.

Email templates must link back with Supabase's one-time `TokenHash`, not access or refresh tokens:

```text
Confirmation: {{ .SiteURL }}/#/confirm?token_hash={{ .TokenHash }}&type=signup
Recovery:     {{ .SiteURL }}/#/reset-password?token_hash={{ .TokenHash }}&type=recovery
```

The SPA submits the one-time token hash to the Node API. The server verifies it with Supabase, stores the resulting session only in the encrypted HttpOnly cookie, and restricts password reset to a recovery-purpose session. Successful reset globally revokes existing sessions and clears the cookie.

Supabase Cloud's default email sender has a low development quota. Real public registration validation currently returns `over_email_send_rate_limit`; configure project SMTP or wait for the project quota window to reset before treating public registration/email delivery as cloud-validated. The bridge deliberately returns a generic registration error and does not bypass confirmation when this happens.

### Stage B.1 cloud email setup

The `teachersinn-development` project currently uses Supabase's built-in mailer: custom SMTP fields are unset and `rate_limit_email_sent` is 2 messages per hour. The built-in service is intended only for initial exploration and may deliver only to pre-authorized organization addresses. Do not keep retrying signup while its shared project quota is exhausted.

For complete validation, configure a development-only sender under **Authentication → Email → SMTP Settings**. Obtain these values from the chosen provider; never place them in this repository:

- SMTP host and port.
- SMTP username and password/API credential.
- Verified From/admin email address.
- Sender display name.
- TLS/security mode required by the provider.
- A conservative development email rate limit.

Disable provider-side click tracking for Auth emails because rewritten links can invalidate verification behavior. Set `APP_ORIGIN` and the Supabase Auth Site URL to the exact development application origin. Add that origin (and only required callback paths) to the redirect allow list.

Replace the cloud **Confirm signup** template link with:

```html
<a href="{{ .SiteURL }}/#/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm email address</a>
```

Replace the cloud **Reset password** template link with:

```html
<a href="{{ .SiteURL }}/#/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

These URLs contain one-time token hashes, never access or refresh tokens. The Node API exchanges the token hash server-side and places the resulting session only in the encrypted HttpOnly cookie. Invalid, expired, or reused hashes are rejected by Supabase Auth.

Email delivery tests are separately guarded. Supply a dedicated disposable inbox through the secret environment, then explicitly opt in only when delivery is operational:

```text
SUPABASE_TEST_EMAIL=<dedicated disposable inbox>
RUN_SUPABASE_EMAIL_INTEGRATION=1
```

The test deletes the resulting development Auth user during cleanup. Never use a real teacher or administrator address. A skipped email test is not a Stage B pass; confirmation and recovery delivery must be observed in the disposable inbox and the one-time links exercised before cutover.

## Existing-account claim preparation

No existing account is migrated automatically. Before claims are enabled:

1. Produce a normalized-email duplicate report from a read-only SQLite backup.
2. Resolve duplicate, missing, shared, and unverified emails manually.
3. Create or invite the Auth identity without inventing a password.
4. Insert `legacy_user_map` only after recording both IDs and the normalized email in an auditable operation.
5. Send a one-time claim/password-setup email to the verified address.
6. Mark the mapping `claimed` only after the identity completes verification and password setup.
7. Require administrators to claim normally, then promote them through a separate audited operation.

Never export scrypt hashes, infer mappings by row order, accept a client-supplied legacy ID, or promote roles through user metadata.

## Enablement blockers

Before an authentication cutover, configure and test production SMTP, confirmation/recovery templates, redirect allowlists, cookie-secret rotation, multi-instance refresh locking or session persistence, monitoring, and the complete account-claim process. Keep `DATA_BACKEND=sqlite` and `AUTH_BACKEND=legacy` until a separately approved cutover.
