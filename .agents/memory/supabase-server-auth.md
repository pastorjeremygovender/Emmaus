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

Browser requests also carry the tab's last server-verified subject as a
consistency assertion. The server compares it with the opaque-session subject
and rejects a mismatch; it never uses the assertion to authenticate or choose
an identity.

**Why:** Session cookies are shared across tabs. Without a separate per-tab
assertion, stale Account A UI can act through Account B's newly replaced cookie
during the brief interval before cross-tab coordination invalidates Account A.

**How to apply:** Keep session discovery and intentional sign-in endpoints able
to discover/replace the session, but attach the assertion to ordinary API reads
and mutations. A mismatch must fail before route handling. Continue to treat the
cookie session and database role lookup as the only authorization authorities.

An active recovery capability is also a routing signal: if a mail client drops
or rewrites the recovery callback query, the authenticated app entry must route
that session to the password form before normal member routing runs.

**Why:** The one-use capability is the authoritative proof that this session
arrived through a verified recovery link; relying only on a browser URL marker
can silently send a recovery session into the app instead of the reset screen.

**How to apply:** Surface only a boolean recovery status to the current session,
never provider tokens or capability values. Clear/consume the capability on the
password update, and let normal routing resume only after it is gone.