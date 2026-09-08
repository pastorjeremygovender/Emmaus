---
name: YouTube OAuth production origin
description: Production YouTube OAuth must use the canonical Emmaus domain and a one-time state rather than relying on the returning browser session cookie.
---

Production Google OAuth redirects can return without the original Emmaus session cookie when a flow starts on a temporary Replit hostname or crosses hostnames. Keep the start route admin-gated, but validate the one-time state at the callback and use the canonical production origin for the redirect URI.

**Why:** The callback previously returned `Authentication required` even though the admin had started the flow while signed in.

**How to apply:** Production redirect URI is `https://emmaus.co.za/api/youtube-archive/oauth/callback`; the Google OAuth client must whitelist that exact URI. Do not make the callback unauthenticated without one-time state validation.