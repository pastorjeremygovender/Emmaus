---
name: Member Personal Details
description: Secure self-service profile fields and Church Register synchronization.
---

Personal Details are stored on the authenticated `user_profiles` row keyed by the server-verified auth subject. The member endpoint exposes only the self-service fields; email, roles, account state, pastoral authority, group permissions, meetings, and attendance remain outside its patch surface.

**Why:** The member-facing record and administrator Church Register must remain one source of truth without trusting a client-supplied user ID or creating duplicate contact data.

**How to apply:** Keep ownership derived from the authenticated server session, use SQL `date` values for birthdays, and audit only changed field names—not phone, address, birth date, or membership values.