---
name: Authenticated JSON cache policy
description: Preventing browser 304 responses from breaking authenticated API clients
---

Authenticated API wrappers that expect every successful response to contain JSON must not rely on browser conditional caching unless they implement an application cache and explicit 304 rehydration.

**Why:** The browser can send validators after a republish or reload, and the server may answer `304 Not Modified` with no response body. A wrapper that checks `response.ok` then parses JSON will treat that valid resource as an error, causing detail pages to appear missing even when the record and authorization are valid.

**How to apply:** Use `cache: 'no-store'` for authenticated room/session JSON requests unless the client deliberately owns the cached payload and handles 304 responses.