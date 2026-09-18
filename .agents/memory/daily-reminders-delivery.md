---
name: Daily Reminders delivery
description: Durable security, timezone, and delivery guarantees for member Web Push reminders.
---

Daily Reminders must use an external one-shot scheduler when Scheduled
Deployments are unavailable, never an in-process timer in the Autoscale API.
The scheduler sends only a tick to an internal Emmaus endpoint; eligibility
stays inside Emmaus. Push subscriptions are device-scoped and an endpoint can
never be silently reassigned from one authenticated account to another.

**Why:** Autoscale instances do not provide reliable scheduler lifetime, and a
browser push endpoint is effectively a device capability whose cross-account
transfer would violate member isolation.

**How to apply:** Keep one permanent VAPID keypair in Emmaus. Authenticate each
external tick with an HMAC over the fixed method/path, millisecond timestamp,
and cryptographic nonce. Enforce a short clock-skew window and atomically claim
the nonce in PostgreSQL before invoking the existing worker. Keep the signing
key only in server/provider secrets, schedule every five minutes, and reject
subscription ownership conflicts.

Production secrets added after a deployment do not reach the already-running
deployment; republish the API before diagnosing a valid scheduler signature as
missing configuration.

Only recognized browser push-service origins may be persisted. Never relax
endpoint validation to accept arbitrary HTTPS URLs: the scheduled sender would
otherwise become an authenticated SSRF sink.

Completion suppression must compare the authoritative Daily Rhythm completion
instant against the reminder timezone's local-day bounds, not compare stored
date labels from two potentially different timezones. Delivery is deliberately
at most once per device/local day; ambiguous network failures are not retried
because avoiding duplicate pastoral nudges is the stronger guarantee.

**Why:** Members can travel or change timezone after a Daily Rhythm ledger row
was labelled, and push-service timeouts can be ambiguous even when a
notification was accepted.

**How to apply:** Preserve the unique device/date claim, recheck completion
immediately before dispatch, and document any future change from at-most-once
semantics before altering retry behavior.