# Supabase Auth cutover readiness

> Stage 3I status: preparation only. No Auth users, emails, passwords, SMTP settings, or active authentication configuration were changed. See `supabase-legacy-auth-transition.md` for the reviewed activation design.

Each SQLite user must map deterministically to one Supabase Auth UUID through `legacy_user_map`. Match only normalized, verified email with an explicit reconciliation decision. Administrators require separately reviewed account-role records; client metadata cannot grant roles. Suspended users remain suspended and cannot establish application identity.

Legacy password hashes use the application's parameterized Node scrypt format and are not imported through the current Supabase bridge. They are not copied into Supabase Auth. Users require an approved invite/reset or controlled credential transition. Email verification and recovery delivery must be operational before cutover. Legacy sessions cannot be converted safely; schedule global invalidation and require reauthentication. Existing HttpOnly, SameSite, CSRF, origin, and secure-cookie protections remain mandatory.

At cutover, account initialization must atomically provide Auth identity, profile, account settings, notification preferences, and consent evidence. The bridge must return the UUID-backed profile rather than require a legacy user row. Password reset, suspension, administrator authorization, refresh, global logout, and deletion must pass real-email and RLS tests.

Account deletion must coordinate Auth deletion with application-row cascades and retained audit obligations. Rollback cannot restore Supabase passwords or previously invalidated sessions; this limitation requires explicit acceptance. No Auth activation, password migration, SMTP change, or real user creation occurs during Stage 3I.
