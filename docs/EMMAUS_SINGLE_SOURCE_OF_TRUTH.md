# Emmaus single source of truth

**Authority date:** 11 September 2026  
**Authoritative integration branch:** `release/emmaus-unified`  
**Purpose:** Prevent duplicate work, lost outcomes, stale instructions and unsafe publishing.

This file overrides older branch notes and status claims when they conflict. Historical branches are evidence sources only; they are not release sources.

## Non-negotiable operating rules

1. Inspect this ledger and relevant Git history before changing Emmaus.
2. Do not rebuild a capability already marked **Preserved**.
3. “Tests pass” does not mean “works for users.” A capability is **Release-ready** only after its real acceptance flow passes.
4. Do not publish the unified branch while it contains the rejected single-screen member UI.
5. Do not run content/data migrations or startup data repair during ordinary deployment.
6. Keep the Bible available and untouched by Daily Rhythm gating.
7. Production, member records, content and secrets are not test fixtures.
8. Any status change must update this ledger in the same commit.

## Current system status

| Area | Authoritative evidence | Status | Next permitted action |
|---|---|---|---|
| Live member web app | User reverted the rejected large single-screen layout in Replit | **Live, but not Git-aligned** | Capture/compare the live UI source before any future publish |
| Jarvis foundation | `codex/jarvis-completion` checkpoint `1f66e467...`; 91 tests / 18 suites reported | **Preserved; do not rebuild** | Use as historical acceptance baseline |
| Jarvis in unified branch | Complete focused foundation workflow runs routing, canonical tools, context, normalization and instructions; 38/38 passed | **Technically verified, not user-accepted** | Create an isolated authenticated preview and run real member scenarios |
| Jarvis continuity additions | Direct current sermon, cross-conversation verified recommendation recall, current Daily Rhythm Scripture/teaching context | **Added and focused tests pass** | Include in the same real preview; do not publish separately |
| Rejected single-screen UI | `EmmausHome.tsx` and related navigation changes are present in unified Git history; user rejected and reverted live | **Blocked** | Never publish as-is; reconcile/remove only after live-source capture |
| Android wrapper | Package `za.co.emmaus.app`; version `1.2.0-rc2`; native verification checks exist | **Buildable candidate, not final release** | Use unified signed APK workflow after UI reconciliation |
| Daily Rhythm widget | Native provider/layout present; user device testing and design refinements occurred | **Implemented; device acceptance previously achieved** | Preserve; verify once in final unified APK |
| Geofence | Native proof classes, reboot restore, offline queue and duplicate suppression are present | **Proof-of-capability, not finished Welcome Assist** | Complete consent/service configuration and church-site acceptance testing |
| Bluetooth | `WelcomeAssistBluetoothPlugin.java` present and Android permission checks exist | **Foundation only** | Test beacon scanning and permission behavior; do not claim finished |
| Google Play | Target SDK 36 and signing workflow exist | **Not submitted/final** | Submit only after one unified APK passes acceptance |
| Replit portability | Domain-backed Android shell helps portability; Supabase connector and Replit deployment remain risks | **Migration required** | Reconcile source first, then move hosting without changing `emmaus.co.za` |

## Jarvis: already built and preserved

Do not recreate these:

- GPT-5.6 Luna / GPT-6 Astra routing.
- Scripture-first system instructions and pastoral boundaries.
- Canonical server-owned actions and fail-closed routes.
- Authenticated active/completed Walk and Journey context.
- Saved Bible position.
- Current Daily Devotional position.
- Sermon retrieval and verified links.
- Durable PostgreSQL conversation storage.
- Concise display/speakable normalization.
- Resource recommendation limits.
- Safety and pastoral handoff structure.

## Jarvis headless delivery progress

- **Verified:** “What should I do next?” can return the actual eligible Daily Rhythm inside the conversation.
- **Verified:** The conversational response includes the published title, Scripture/reference, available verse text, teaching and reflection.
- **Verified:** The visible route remains optional; the same response is suitable for later speech output.
- **Not yet verified:** conversational confirmation and execution of completion, reflection saving, prayer continuation and human handoff.
- **Not yet user-accepted:** isolated authenticated preview.

## Jarvis: current real acceptance gate

Jarvis is **not working/release-ready** until one authenticated preview passes these as a member would say them:

- “Continue where I stopped.”
- “What should I do next?”
- “I didn’t understand today’s Scripture.”
- “Open this week’s sermon.”
- “What was Pastor Jeremy teaching about forgiveness?”
- “Show me the Walk you recommended yesterday.”
- “I’m struggling and I don’t know what I need.”

For every scenario verify:

- concise, natural pastoral answer;
- correct signed-in member context;
- correct Scripture and Emmaus content;
- no fabricated sermon/resource/route;
- only the most relevant resource link;
- working destination and working back navigation;
- graceful specific failure if a source is unavailable.

## Consolidation defects already identified

- Historical Jarvis work and the unified branch diverged.
- Earlier green unified workflows ran only two Jarvis test files.
- Project memory contains legacy startup-migration guidance that conflicts with later safety decisions.
- Widget documentation still describes the widget as isolated/unmerged although widget files are present in the unified branch.
- Replit live UI and GitHub unified UI are not currently identical.
- Chat synchronization cannot be treated as project state.

## Release definition

There is one intended release source: `release/emmaus-unified`.

It must not become the actual release until all of the following are true:

- live accepted UI reconciled into Git;
- Jarvis real acceptance gate passes;
- widget verified in the same APK;
- geofence consent and service-window flow tested;
- Bluetooth capability tested or explicitly disabled behind a safe flag;
- signed APK installs over the existing signed app;
- web build, API build and native checks pass;
- no startup content/data mutations;
- rollback commit and downloadable artifact recorded.

Until then, the unified branch is an integration candidate—not proof that Emmaus is consolidated.

## Jarvis headless Daily Rhythm checkpoint — 11 September 2026

- Authoritative code checkpoint: `6aa20c68f646cb5bc6238b41abc3678846bd1518` on `release/emmaus-unified`.
- Unified verification run 100 passed: complete Jarvis foundation tests, API typecheck, single-toggle navigation, and member production build.
- Jarvis can deliver the eligible published Daily Rhythm content conversationally, then guide reflection and prayer without requiring screen navigation.
- Progress remains user-controlled: completion language creates a pending server-verified action; only an explicit yes executes `completeStep`. No, review language, replay language, and ambiguous replies do not advance progress.
- This checkpoint is not published to production. The next gate is an isolated authenticated Talk to Emmaus acceptance test.
