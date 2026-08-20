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

**Why:** A new provider identity for an unmigrated legacy email must not look
like a successful but empty Emmaus account. Sign-up, sign-in, recovery-email
issuance, and verified email-link callbacks must all block that profile before
they can establish a session.

**How to apply:** Preflight all email/password entry points for an unbound
legacy profile and return a clear migration-required message. Configure
Supabase Auth itself with the exact public server callback URL and a recovery
email action link using `token_hash` plus `type=recovery`; a provider redirect
that opens the web app directly skips the server verification step. Emit only
sanitized callback telemetry (path, type, and token-presence), never tokens,
passwords, or provider credentials.

The Supabase connector proxy authenticates requests with the project
credential, not a caller's end-user bearer token.

**Why:** Replaying a Supabase recovery/session token through `/auth/v1/user`
causes a missing-subject JWT failure even after OTP verification succeeds.

**How to apply:** Use the verified `user` returned by password sign-in or OTP
verification to establish the Emmaus session. After the one-use recovery
capability is consumed, change the password through the connector's
server-authorized admin user endpoint; do not send provider tokens to the
browser or depend on the proxy to forward user bearer tokens.

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

Admin and pastoral account populations must include only verified identities:
an `auth_subject`-bound profile whose subject also exists in the identity table.
New member-owned activity uses that immutable subject; read paths may resolve
the subject first and fall back to email only for pre-migration historical rows.

**Why:** Email-only profiles and frontend fixtures made blank or demo accounts
look real, while subject-only display joins made historical activity lose the
member's name.

**How to apply:** Use the same verified population for Emmaus Accounts, All
People, and account-count metrics. Keep roles database-controlled. Do not create
a profile by placing a provider subject into an email field. Cover both subject-
keyed and historical email-keyed display joins in database-backed tests.

Confirmed fixture deletion must be a one-time, auditable maintenance action,
not a recurring email allowlist.

**Why:** A broad cleanup rerun on every boot could delete a future legitimate
account or locally authored content whose identifier collides with old demo
data.

**How to apply:** Target only a production-confirmed fixture, acquire a
transaction lock, write a durable receipt even when skipped/not found, and
refuse verified, privileged, configured-owner, or data-bearing profiles.
Browser-cache cleanup must match a complete known fixture signature rather than
an ID alone.

Account removal is an application lifecycle state, not an email workaround.
Removed members retain their immutable provider subject and all member-owned
data until reinstated; permanent deletion writes a durable subject tombstone
before purging local identity data.

**Why:** Provider suspension or deletion can fail after a local change, and
sign-in can race with account deletion. Without a tombstone and fail-closed
profile checks, an opaque session or a late provider response could recreate
access after a deletion.

**How to apply:** Resolve an active profile and reject tombstoned subjects on
every authenticated request. Permanent-delete retries must be idempotent:
retain the tombstone, allow only an already-deleted provider 404 to count as
completion, and never recreate a profile for that subject. Shared room records
must be anonymized field-by-field rather than deleting the room for other
members.