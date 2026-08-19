---
name: Supabase server-mediated authentication
description: The security boundaries and Supabase email-link rules for Emmaus account identity.
---

Emmaus uses Supabase only as the identity provider. The browser must never be
given Supabase access or refresh tokens as an authentication authority; it
holds only the opaque, Secure, HttpOnly Emmaus `sid` cookie. The API server
uses the attached Supabase connector and resolves the app role from Emmaus
PostgreSQL on every request.

**Why:** Provider credentials in browser state or URL fragments expand the
XSS and token-replay boundary and bypass the app's own session controls.

**How to apply:** Supabase confirmation and recovery email templates must send
`TokenHash` to the Emmaus server callback through `RedirectTo`, with `type`
`email` or `recovery`. The server verifies that hash, stores provider tokens
only in the server session, and redirects back to the app. A recovery callback
may grant a short-lived, one-use server-session capability for password
updates; normal sign-in sessions must not use the recovery password endpoint.
Legacy email-only profiles remain unclaimed except for the exact configured
initial-owner mailbox, which may bind one profile only when it atomically
claims the previously unclaimed bootstrap marker.