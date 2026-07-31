# Emmaus Launch Board — 13 August 2026

> **Mode:** Launch-only. No new features. No redesigns. No refactors.
> Fix launch blockers only. Branch: `launch-13-august`.

---

## Pillars & Status

| # | Pillar | Completion | Status |
|---|--------|-----------|--------|
| 1 | Daily Rhythm | 70% | 🔴 Blockers |
| 2 | Daily Devotionals | 65% | 🔴 Blockers |
| 3 | Walks & Journeys | 75% | 🟠 Blockers |
| 4 | Bible Studies | 40% | 🔴 Blockers |
| 5 | Bible | 80% | 🟡 Issues |
| 6 | Rooms | 60% | 🟠 Blockers |
| 7 | Ask Emmaus | 75% | 🟠 Blockers |
| 8 | Sermon Companions | 55% | 🔴 Blockers |

**Status key:** 🔴 Has P0 blocker · 🟠 Has P1 blocker · 🟡 P2 issues only · ✅ Clear

---

## Launch Blockers

### 🔴 P0 — Hard Blockers
> Must fix before any member sees the app.

---

#### 1 · Daily Rhythm

- [ ] **DR-1 · Hard-coded journey ID**
  Reader (`DailyRhythmDay.tsx:93–105`) hardcodes `15-minutes-with-jesus`. Walk and next-step engine resolve by `journeyType === 'daily-rhythm'`. If the live DB journey slug ever differs, the reader stalls forever at Loading with no error shown to the user.
  _Files:_ `pages/DailyRhythmDay.tsx`, `pages/Walk.tsx:600`, `lib/next-step-engine.ts:81`
  _Effort:_ 1–2 hrs

- [ ] **DR-2 · Progress API accepts caller-supplied userId** _(shared with Walks)_
  `routes/journeys.ts:7–9, 24–35` falls back to `userId` in query/body. Any authenticated caller knowing a user ID can read, write, or complete another user's Daily Rhythm progress.
  _Files:_ `api-server/src/routes/journeys.ts`
  _Effort:_ 2–4 hrs

---

#### 2 · Daily Devotionals

- [ ] **DEV-1 · Header-based admin auth (security)**
  `routes/devotionals.ts:15–29` trusts the `X-User-Role` header supplied by the client. Any authenticated user can claim `admin`, read all Draft series, and mutate any content.
  _Files:_ `api-server/src/routes/devotionals.ts`
  _Effort:_ 2–4 hrs

---

#### 4 · Bible Studies

- [ ] **BS-1 · Generated content invisible to members**
  `VerseStudyPanel.tsx:337–351` and `ChapterReader.tsx:188, 193` call static path-style routes (`/api/bible/chapter-overview/:book/:chapter`, `/api/bible/book-intro/:bookId`) that return hardcoded data from `book-intros.ts`. The DB member routes (`/api/bible/chapter-overview?bookId=&chapter=`, `/api/bible/book-intro?bookId=`) have no frontend caller. All 1,035 generated study notes, 247 chapter overviews, and 6 book intros are invisible to members.
  _Files:_ `components/VerseStudyPanel.tsx`, `pages/bible/ChapterReader.tsx`, `api-server/src/routes/bible.ts:188–219`
  _Effort:_ 1 day

- [ ] **BS-2 · ChapterOverview type mismatch**
  `VerseStudyPanel`'s `ChapterOverview` type and renderer expect `{ summary }` (static shape). The DB row contains `main_themes`, `key_people`, `key_locations`, `passage_divisions`, `key_verse`, `jesus_connection`, `book_connection`. Routing fix (BS-1) alone is not enough; the renderer must be updated to match the DB shape.
  _Files:_ `components/VerseStudyPanel.tsx:411–490`
  _Effort:_ 2–4 hrs

---

#### 8 · Sermon Companions

- [ ] **SC-1 · Timestamp links generated but never rendered**
  The generation pipeline stores timestamped sermon links in the DB (`sermon-generator.ts:826–861`). `SermonCompanionReader.tsx:42–53` defines `SCEntry` without a `sermonLink` field; the reader never renders them. Members cannot tap to the sermon moment they are reflecting on.
  _Files:_ `pages/SermonCompanionReader.tsx`, `api-server/src/lib/sermon-generator.ts`
  _Effort:_ 1–2 hrs

- [ ] **SC-2 · Admin has no companion management UI**
  `Admin.tsx:28–54` exposes Dashboard, Content Studio, Bible Study, People, Settings, Testing. No Sermon or Companion section exists. Full CRUD/publish routes are present on the server but unreachable through the admin shell.
  _Files:_ `pages/Admin.tsx`, `api-server/src/routes/sermon-companions.ts`
  _Effort:_ 1–2 days

- [ ] **SC-3 · Generation confirmation flow has no UI**
  `routes/sermon-generator.ts:38–50` returns a structured `{ success: false, code: 'SERMON_CONFIRMATION_REQUIRED' }` HTTP 200 when boundary detection is low-confidence. No admin UI handles this response; complex sermons appear to silently fail generation.
  _Files:_ `pages/admin/` (absent handler), `lib/sermon-generator-api.ts:130–233`
  _Effort:_ 4–8 hrs

---

### 🟠 P1 — Major Functional Gaps
> Launch is significantly degraded without these.

---

#### 3 · Walks & Journeys

- [ ] **WJ-1 · Completion drops return context**
  `JourneyDay` passes `source/sourceId` into the completion URL. `WalkCompletePage.tsx:47–49` ignores them and always returns to `/journeys/:journeyId`. Members who entered from Walk, Bible, or Sermon have no correct back route after completing a step.
  _Files:_ `pages/WalkCompletePage.tsx`, `pages/JourneyDay.tsx:57–60`
  _Effort:_ 2–4 hrs

- [ ] **WJ-2 · Back-navigation naming collision**
  Three incompatible param names in active use: `source`, `from`, `backSource`. `JourneyDetail` emits `backSource`; `JourneyDay`/`WalkCompletePage` read only `source/sourceId`. `JourneyPreviousDays` understands only `from`. The return-context chain breaks at multiple boundaries.
  _Files:_ `pages/JourneyDetail.tsx:42–48`, `pages/JourneyPreviousDays.tsx:26–52`, `lib/return-context.ts`
  _Effort:_ 1 day

---

#### 2 · Daily Devotionals _(continued)_

- [ ] **DEV-2 · No admin authoring UI**
  Full CRUD API exists (`routes/devotionals.ts`, `devotional-store.ts`) but no page exists under `src/pages/admin` to create or edit series. Admins must use raw API calls.
  _Files:_ `src/pages/admin/` (absent), `lib/devotionals-api.ts`
  _Effort:_ 1–2 days

---

#### 7 · Ask Emmaus

- [ ] **AE-1 · Memory saved but never loaded**
  Users consent and save memory (`AskEmmausConversation.tsx:381–391`). `handleConversation` never fetches user memories or passes them to `buildContext` (`conversation-service.ts:299–304`). Memory has zero effect on any answer.
  _Files:_ `api-server/src/emmaus/conversation-service.ts`, `pages/personal/AskEmmausConversation.tsx`
  _Effort:_ 2–4 hrs

- [ ] **AE-2 · Follow-up prompts never shown**
  System prompt specifies `followUpPrompts` (`system-instructions.ts:239–243`), metadata type carries them (`emmaus-client.ts:84–92`), but the conversation UI renders nothing for them (`AskEmmausConversation.tsx:470–485`). Users see no suggested follow-on questions.
  _Files:_ `pages/personal/AskEmmausConversation.tsx`, `api-server/src/emmaus/system-instructions.ts`
  _Effort:_ 2–4 hrs

---

#### 6 · Rooms

- [ ] **RM-1 · Core Room features are stubs**
  `RoomsContext.tsx:57–85, 232–260` exposes empty arrays and no-ops for notifications, journey invitations, participant tracking, shared reflections, posts, and admin archive/revoke. Any UI relying on these cannot function.
  _Files:_ `contexts/RoomsContext.tsx`, `api-server/src/routes/rooms.ts`
  _Effort:_ 3–5 days

- [ ] **RM-2 · `startSharedJourney` uses non-atomic endpoint**
  `RoomsContext.startSharedJourney` calls the ordinary link endpoint, not the atomic `/start-shared` (`RoomsContext.tsx:243–251`). Progress initialisation can diverge from the server's atomic flow. The atomic client wrapper exists but is unused (`rooms-api.ts:169–177`).
  _Files:_ `contexts/RoomsContext.tsx`, `lib/rooms-api.ts`
  _Effort:_ 1–2 hrs

---

### 🟡 P2 — Quality Issues
> Degrade experience. Fix before broad rollout.

| ID | Pillar | Issue | Files | Effort |
|----|--------|-------|-------|--------|
| P2-1 | Rooms | Chat header shows "Room Chat" not room name — `RoomDetail` navigates without setting `history.state.roomName` | `pages/rooms/RoomDetail.tsx:130–132`, `RoomChat.tsx:83–87` | 30 min |
| P2-2 | Devotionals | `markDayComplete` race condition — read-then-write on `completedDays` JSONB; concurrent devices overwrite each other | `api-server/src/lib/devotional-store.ts:268–287` | 1–2 hrs |
| P2-3 | Daily Rhythm | Silent completion sync failure — `completeStep` swallows API errors; progress vanishes on reload with no retry | `contexts/JourneyContext.tsx:303–306` | 2–4 hrs |
| P2-4 | Sermon Companions | Status casing mismatch — generation returns `"draft"` (lowercase); DB/store use `"Draft"`; strict comparisons fail | `api-server/src/routes/sermon-generator.ts:106–110` | 30 min |
| P2-5 | Ask Emmaus | History omits practical nextSteps — past conversations lose actionable read/pray/continue/listen cards | `pages/personal/AskEmmausHistory.tsx:94–105` | 1–2 hrs |
| P2-6 | Ask Emmaus | Pastoral handoff has no UI — server sets `handoffType: pastoral` but client renders no banner or contact action | `pages/personal/AskEmmausConversation.tsx:258–261` | 2 hrs |
| P2-7 | Bible | Preached Here links open YouTube directly — no in-app sermon route used across Bible, Ask Emmaus, VerseStudyPanel | `data/sermon-verse-links.ts`, `components/emmaus/ResourceCard.tsx:65–70` | 4–8 hrs |
| P2-8 | Bible | Cloud annotation PATCH is fire-and-forget — save failures are silent; concurrent devices overwrite each other's full arrays | `contexts/BibleContext.tsx:162–179` | 4 hrs |
| P2-9 | Bible Studies | Progress Dashboard cannot bulk-publish overviews — server endpoint exists but dashboard never calls it | `pages/admin/content-studio/BibleProgressDashboard.tsx:102–125` | 1 hr |
| P2-10 | Daily Rhythm | `isCompletedToday` timezone brittleness — `toLocaleDateString()` without explicit locale produces brittle date strings | `lib/daily-lock.ts:17–25` | 1 hr |
| P2-11 | Rooms | Unauthenticated users cannot join via invite link — must already be signed in before confirmation | `pages/rooms/JoinByLink.tsx:20–36` | 1 day |
| P2-12 | Sermon Companions | Non-atomic publish — two independent store calls; header can publish while entry update fails | `api-server/src/routes/sermon-companions.ts:287–295` | 1–2 hrs |

---

## Effort Summary

| Priority | Count | Estimated Total |
|----------|-------|----------------|
| P0 — Hard blockers | 7 items | 3–5 days |
| P1 — Major gaps | 8 items | 5–8 days |
| P2 — Quality issues | 12 items | 3–4 days |
| **Total** | **27 items** | **11–17 days** |

---

## Frozen Scope

Everything outside the eight pillars listed above is frozen for this release.
No new features, no UI redesigns, no refactors of working code.

_Last updated: 31 July 2026_
