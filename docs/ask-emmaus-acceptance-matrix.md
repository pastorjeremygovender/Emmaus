# Ask Emmaus acceptance matrix

Status: **release evidence, not a production approval**. The automated checks below
run against the repository's test doubles or development database. A production
release remains blocked until the authenticated browser checklist is completed.

## Evidence recorded on 2026-08-28

| Check | Result | Evidence |
|---|---|---|
| Preview authentication boundary | Observed only while signed out | `evidence/task-712-preview-sign-in.jpg`; the preview displayed the sign-in form and browser logs reported `authenticated: false` |
| Authenticated API transport parity | Passed with isolated test identities | `pnpm run test:sermon-action-parity` — 3/3 tests passed for typed Ask Emmaus, Voice, resumed Voice, canonical/archive sermon actions, negative retrieval, timing fields, and correlatable request IDs |
| Multi-user capability matrix | Passed with isolated database-backed fixtures | `pnpm --filter @workspace/api-server run test:multi-user-acceptance` — separate real member identities cover Bible Studies, Discover, Daily Devotional, Walks, Journeys, Daily Rhythm locks, saved Bible position, private progress, unpublished resources, and invalid targets |
| Authenticated browser flow | **Not verified** | This environment has no real member/admin credentials or browser interaction capability; the screenshot is not evidence of a signed-in account |
| Frontend account isolation/path regression suite | Passed as automated tests | `App.browser-paths.test.tsx`, `App.startup-performance.test.tsx`, and `provider-account-isolation.test.tsx` — 13/13 tests passed |
| API restart/persistence boundary | Observed | API workflow restarted cleanly; the current conversation store remains memory-backed and is not restart-safe |

The test identities above are deliberately isolated development identities created
by the test-only auth harness. They are not real member/admin accounts and do not
replace the authenticated browser checklist below. Matrix statuses remain
unchanged where browser or multi-user release evidence is still outstanding.

The final server log also correlated the deterministic typed request
`reqId=gt7mci` (`authMs=0`, `totalMs=414`, no model generation) with the general
Voice request `reqId=gx8hlu` (`authMs=0`, `modelTtftMs=939`,
`modelGenerationMs=7098`, `totalMs=7604`). These are development test identities,
not publication evidence.

| Requirement | Status | Evidence |
|---|---|---|
| Canonical published sermons are indexed | Fully verified | `src/lib/__tests__/sermon-knowledge-index.test.ts`; `updateSermonLifecycle` |
| Sermon companion publish/update/entry update/unpublish synchronizes search | Fully verified | companion routes await `syncKnowledgeIndexForSermon`; route/typecheck evidence |
| Read-only index coverage diagnostic | Fully verified | `GET /api/sermons/admin/retrieval-diagnostics` |
| Explicit stale/orphan/missed-index repair | Fully verified | `POST /api/sermons/admin/retrieval-diagnostics/repair`; `repair:knowledge-index` |
| Live publication-safe catalogue for devotionals, Bible Studies, Walks, Journeys | Fully verified | `resource-catalogue.ts`; `citation-validation.test.ts`; publication predicates are applied at query time |
| Natural-language devotional, Bible, saved-position, Walk/Journey routing | Fully verified | `src/emmaus/__tests__/intent-router.test.ts`; `canonical-tools.ts` |
| Bible Study and pastoral resource discovery | Partially implemented | Shared router and catalogue-backed action validation are covered by `multi-user-acceptance.test.ts`; pastoral resource discovery remains outside this suite |
| Sermon topic and timestamped segment search | Fully verified | `sermon-retrieval.ts`, authenticated DB-backed `sermon-action-parity.test.ts`; canonical and archive Watch/Listen actions plus timestamp offsets match across typed and Voice transports |
| Exact Bible route and aliases | Fully verified | `intent-router.test.ts`, `citation-validation.test.ts`; Psalm 23, John 3:16/3:16–18, 1 Corinthians 13, 2 Thessalonians 3:6–10, Song of Songs 2:1 |
| Scripture-first general questions | Fully verified | `conversation-service.ts` retrieval ordering and citation validation tests |
| No fabricated/unpublished/locked/other-user resources or actions | Fully verified in automated acceptance scope | `multi-user-acceptance.test.ts` rejects unpublished resources, locked Daily Rhythm content, member A's progress and saved position for member B, invented/mismatched targets, and invalid Bible destinations |
| Structured stage latency evidence | Partially implemented | existing request/retrieval/TTFT/total logs; authenticated comparison of deterministic vs general requests remains |
| Conversation persistence across restarts | Not implemented | `getConversationStore()` is memory-backed; Firestore model is inactive. Do not claim restart durability |
| Voice and Live Audio/Video in this release | Fully verified as excluded | Voice transport remains outside the typed canonical branch; no LiveKit/TTS changes are part of this work |

## Authenticated browser checklist

Run this against the intended deployment with a real member and an admin account,
then attach timestamps/screenshots or request IDs to the release record:

1. Sign in as member A; confirm `Take me to the Bible`, each exact reference,
   `Continue reading my Bible`, `Open my devotional`, current Walk/Journey, and
   `My Journey` land on the expected routes.
2. Seed or identify one published and one unpublished record for each searchable
   resource type. Search by title, synonym, Scripture, and pastoral topic; verify
   only published records produce cards and every card opens successfully.
3. Sign in as member B. Confirm member B cannot see member A's saved Bible
   position, progress, private notes, room data, or locked Daily Rhythm step.
4. Publish, edit, edit a companion entry, unpublish, archive, and delete a
   sermon/companion. Confirm Ask Emmaus no longer returns removed content and
   that the admin diagnostic and repair counts explain any discrepancy.
5. Compare a deterministic command and a general biblical question using request
   logs. Record authentication, context, routing, each retrieval source, model
   TTFT/full generation, validation, and total duration.
6. Restart the API and verify the persistence statement above: current
   conversations are memory-backed and should not be described as restart-safe.

Until this checklist is completed, the status is **awaiting authenticated/manual
verification** and publication should not be recommended.