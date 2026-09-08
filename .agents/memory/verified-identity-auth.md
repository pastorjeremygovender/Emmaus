---
name: Verified identity and role bootstrap
description: Durable security rules for OIDC identity, database roles, and the one-time initial super-admin claim.
---

Use the verified OIDC `sub` as the immutable account identity, and resolve the application role from PostgreSQL on every authenticated request. Never authorize from browser-supplied IDs, roles, emails, or legacy `X-User-*` headers.

**Why:** The former demo identity was shared by multiple people and therefore cannot be safely reassigned or used to migrate ownership to one real account. Database role lookup also makes demotion effective immediately instead of leaving stale authority in a session.

**How to apply:** New authenticated features must use the server-populated request user. Provision the initial owner only when the strictly verified email matches the configured bootstrap value and the database bootstrap marker is still unclaimed. Once claimed, deletion or demotion must never cause automatic re-promotion.

Canonical callback and CORS origins must come from explicit trusted configuration, never `Host` or forwarded-host request headers. Cookie-authenticated unsafe methods must continue enforcing same-origin protection.