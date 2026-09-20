# Supabase password recovery callback contract

Emmaus password-reset links must reach the API callback before opening the
browser password form. The API verifies the one-time Supabase token, creates an
opaque Emmaus session with a short-lived recovery capability, and then redirects
to the form.

## Production configuration

For the canonical production host `https://emmaus.co.za`, configure the same
Supabase project used by the production API:

1. In **Authentication → URL Configuration**, set **Site URL** to
   `https://emmaus.co.za`.
2. Add this exact value under **Redirect URLs**:
   `https://emmaus.co.za/api/auth/callback`
3. In **Authentication → Email Templates → Reset Password**, make the action
   link target this exact callback shape:

   ```text
   {{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery
   ```

The API expects `token_hash` and `type=recovery`. A bare site URL, the SPA route
`/auth/callback`, or an email template using a provider format that redirects
straight to the home page bypasses the required server verification step.

## Validation checklist

- Request a new reset email after changing the configuration; older messages
  retain the previous destination.
- The first request after clicking the link must be
  `GET /api/auth/callback` in the production logs.
- The callback must then return a `303` to
  `/auth/callback?mode=recovery`.
- The browser must show **Choose a new password** before any normal Emmaus
  content is rendered.

Do not put provider tokens in browser storage or use them directly from the
single-page app.