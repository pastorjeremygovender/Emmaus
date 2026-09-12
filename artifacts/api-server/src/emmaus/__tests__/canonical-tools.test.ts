import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyRhythmConversation,
  canonicalFailureMetadata,
  resolveCanonicalAskRequest,
  resolveContextualFollowUp,
  resolveCurrentDevotionalEntry,
  resolveDateAllocatedDevotionalEntry,
} from "../canonical-tools.ts";
import { normalizeEmmausResponse } from "../response-normalization.ts";

describe("canonical Ask Emmaus tools", () => {
  it("returns a capability-owned location for application help", async () => {
    const result = await resolveCanonicalAskRequest("Where can I find devotionals?", "member-1");
    assert.equal(result.handled, true);
    if (!result.handled) return;
    assert.equal(result.metadata.nextStep?.path, "/journeys?tab=devotionals");
    assert.equal(result.metadata.capabilityActions?.[0]?.capabilityId, "daily-devotional");
    assert.equal(result.metadata.recommendations[0]?.type, "devotional");
  });

  it("returns validated in-app actions for the release-gate imperatives", async () => {
    const walk = await resolveCanonicalAskRequest("Open the walk please", "member-1");
    assert.equal(walk.handled, true);
    if (!walk.handled) return;
    assert.equal(walk.metadata.capabilityActions?.length ?? 0, 0);
    assert.equal(walk.metadata.nextStep, null);
    assert.match(walk.metadata.answer ?? "", /which walk/i);
    assert.equal(
      normalizeEmmausResponse({ answer: walk.metadata.answer ?? "", metadata: walk.metadata })
        .metadata.jarvis?.suggestedNextAction?.route,
      undefined,
    );

    const start = await resolveCanonicalAskRequest("Start my Walk", "member-1");
    assert.equal(start.handled, true);
    if (!start.handled) return;
    assert.equal(start.metadata.capabilityActions?.[0]?.route, "/walk");

    const today = await resolveCanonicalAskRequest("Open Today's Steps", "member-1");
    assert.equal(today.handled, true);
    if (!today.handled) return;
    assert.equal(today.metadata.capabilityActions?.[0]?.route, "/walk");

    const continueRequest = await resolveCanonicalAskRequest("Continue where I stopped", "member-1");
    assert.equal(continueRequest.handled, true);
    if (!continueRequest.handled) return;
    assert.ok(
      continueRequest.metadata.resourceActions?.some((action) =>
        action.kind === "CONTINUE" || action.kind === "OPEN",
      ) || continueRequest.metadata.capabilityActions?.length,
    );

    const scripture = await resolveCanonicalAskRequest("Read today's Scripture", "member-1");
    assert.equal(scripture.handled, true);
    if (!scripture.handled) return;
    assert.ok(
      scripture.metadata.resourceActions?.length
      || scripture.metadata.capabilityActions?.some((action) => action.route === "/walk"),
    );

    const sermon = await resolveCanonicalAskRequest("Play this week's sermon", "member-1");
    assert.equal(sermon.handled, true);
    if (!sermon.handled) return;
    assert.ok(
      sermon.metadata.resourceActions?.some((action) => action.route.startsWith("/sermon/"))
      || sermon.metadata.capabilityActions?.some((action) => action.route === "/journeys?tab=sermons"),
    );
  });

  it("reads an exact Bible reference and issues the canonical Bible route", async () => {
    const result = await resolveCanonicalAskRequest("Read John 3:16", "member-1");
    assert.equal(result.handled, true);
    if (!result.handled) return;
    assert.equal(result.metadata.scripture?.reference, "John 3:16");
    assert.equal(result.metadata.nextStep?.path, "/bible/read/john/3?startVerse=16&endVerse=16");
    assert.match(result.metadata.answer ?? "", /For God so loved the world/i);
    assert.equal(result.metadata.recommendations.length, 0);
  });

  it("rejects an invalid chapter without inventing a destination", async () => {
    const result = await resolveCanonicalAskRequest("Read John 999", "member-1");
    assert.equal(result.handled, true);
    if (!result.handled) return;
    assert.equal(result.metadata.nextStep, null);
    assert.match(result.metadata.answer ?? "", /validate/i);
  });

  it("delivers today's discipleship experience without requiring a screen", () => {
    const metadata = buildDailyRhythmConversation(
      {
        journeyId: "10-minutes-with-jesus",
        progress: null,
        currentStepId: "rhythm-day-20",
        currentDayNumber: 20,
        currentStepTitle: "You Can Trust His Voice",
        currentStepCompleted: false,
        completedStepIds: [],
        availableStepIds: ["rhythm-day-20"],
        reviewableStepIds: [],
        nextStepLocked: false,
        nextEligibleUnlockDate: null,
        todayAvailableDay: 20,
        assignedDay: 20,
        openingState: "OPENING_REQUIRED",
        localTimezone: "Africa/Johannesburg",
        localDate: "2026-09-11",
      },
      {
        id: "rhythm-day-20",
        journeyId: "10-minutes-with-jesus",
        day: 20,
        title: "You Can Trust His Voice",
        status: "Published",
        mentorIntro: "Let us listen carefully to Jesus today.",
        scripture: "John 10:27–30",
        devotional: "Jesus knows His sheep and leads them securely.",
        reflectionQuestion: "Where is Jesus asking you to trust His voice?",
        prayerPrompt: "Jesus, help me recognise and trust Your voice.",
        actionStep: "",
        scriptureReferences: [{
          reference: "John 10:27–30",
          translation: "BSB",
          verseText: "My sheep listen to My voice; I know them, and they follow Me.",
        }],
      } as never,
    );

    assert.match(metadata.answer ?? "", /Today: You Can Trust His Voice/);
    assert.match(metadata.answer ?? "", /John 10:27–30/);
    assert.match(metadata.answer ?? "", /My sheep listen to My voice/);
    assert.match(metadata.answer ?? "", /Jesus knows His sheep/);
    assert.match(metadata.answer ?? "", /Reflection:/);
    assert.equal(metadata.scriptureReferences?.[0]?.reference, "John 10:27–30");
    assert.equal(metadata.resourceActions?.[0]?.route, "/daily-rhythm/day/20");
    assert.deepEqual(metadata.followUpPrompts, [
      "Help me reflect on this.",
      "Pray with me about this.",
    ]);
  });

  it("requires explicit confirmation before completing today's Daily Rhythm", async () => {
    const calls: Array<{ userId: string; journeyId: string; day: number }> = [];
    const executors = {
      completeStep: (async (userId: string, journeyId: string, day: number) => {
        calls.push({ userId, journeyId, day });
        return {} as never;
      }) as never,
    };
    const previous = {
      scripture: null,
      nextStep: null,
      nextSteps: [],
      recommendations: [],
      resourceActions: [{
        kind: "READ" as const,
        resourceType: "daily_rhythm" as const,
        resourceId: "rhythm-day-20",
        parentId: "10-minutes-with-jesus",
        route: "/daily-rhythm/day/20",
      }],
      followUpPrompts: [],
      handoffType: null,
    };

    const confirmation = await resolveContextualFollowUp(
      "I'm finished",
      previous,
      "member-1",
      executors,
    );

    assert.equal(calls.length, 0);
    assert.equal(confirmation?.pendingMemberAction?.kind, "COMPLETE_DAILY_RHYTHM");
    assert.match(confirmation?.answer ?? "", /would you like me/i);

    const completed = await resolveContextualFollowUp(
      "Yes, please.",
      confirmation!,
      "member-1",
      executors,
    );

    assert.deepEqual(calls, [{
      userId: "member-1",
      journeyId: "10-minutes-with-jesus",
      day: 20,
    }]);
    assert.equal(completed?.pendingMemberAction, null);
    assert.match(completed?.answer ?? "", /complete/i);
  });

  it("guides reflection and prayer before offering completion", async () => {
    const teaching = buildDailyRhythmConversation(
      {
        journeyId: "10-minutes-with-jesus",
        progress: null,
        currentStepId: "rhythm-day-20",
        currentDayNumber: 20,
        currentStepTitle: "You Can Trust His Voice",
        currentStepCompleted: false,
        completedStepIds: [],
        availableStepIds: ["rhythm-day-20"],
        reviewableStepIds: [],
        nextStepLocked: false,
        nextEligibleUnlockDate: null,
        todayAvailableDay: 20,
        assignedDay: 20,
        openingState: "OPENING_REQUIRED",
        localTimezone: "Africa/Johannesburg",
        localDate: "2026-09-11",
      },
      {
        id: "rhythm-day-20",
        journeyId: "10-minutes-with-jesus",
        day: 20,
        title: "You Can Trust His Voice",
        status: "Published",
        scripture: "John 10:27–30",
        devotional: "Jesus knows His sheep.",
        reflectionQuestion: "Where is Jesus asking you to trust His voice?",
        prayerPrompt: "Jesus, help me recognise and trust Your voice.",
      } as never,
    );

    const reflection = await resolveContextualFollowUp(
      "Help me reflect on this.",
      teaching,
      "member-1",
    );
    assert.equal(reflection?.discipleshipConversation?.phase, "REFLECTION");
    assert.match(reflection?.answer ?? "", /where is Jesus asking/i);

    const prayerOffer = await resolveContextualFollowUp(
      "I need to trust Him with tomorrow.",
      reflection!,
      "member-1",
    );
    assert.equal(prayerOffer?.discipleshipConversation?.phase, "PRAYER_OFFER");
    assert.match(prayerOffer?.answer ?? "", /would you like me to pray/i);

    const prayer = await resolveContextualFollowUp(
      "Yes, please.",
      prayerOffer!,
      "member-1",
    );
    assert.equal(prayer?.discipleshipConversation?.phase, "PRAYER");
    assert.match(prayer?.answer ?? "", /Jesus, help me recognise/i);

    const completion = await resolveContextualFollowUp(
      "I'm finished.",
      prayer!,
      "member-1",
    );
    assert.equal(completion?.pendingMemberAction?.kind, "COMPLETE_DAILY_RHYTHM");
    assert.match(completion?.answer ?? "", /mark today's Daily Rhythm complete/i);
  });

  it("cancels a pending completion without changing progress", async () => {
    let calls = 0;
    const metadata = await resolveContextualFollowUp(
      "No, not yet.",
      {
        scripture: null,
        nextStep: null,
        nextSteps: [],
        recommendations: [],
        followUpPrompts: [],
        handoffType: null,
        pendingMemberAction: {
          kind: "COMPLETE_DAILY_RHYTHM",
          journeyId: "10-minutes-with-jesus",
          stepId: "rhythm-day-20",
          day: 20,
          label: "Mark today's Daily Rhythm complete",
          requiresConfirmation: true,
        },
      },
      "member-1",
      {
        completeStep: (async () => {
          calls += 1;
          return {} as never;
        }) as never,
      },
    );

    assert.equal(calls, 0);
    assert.equal(metadata?.pendingMemberAction, null);
    assert.match(metadata?.answer ?? "", /nothing has been changed/i);
  });

  it("never treats review language as progress confirmation", async () => {
    let calls = 0;
    const metadata = await resolveContextualFollowUp(
      "Review today",
      {
        scripture: null,
        nextStep: null,
        nextSteps: [],
        recommendations: [],
        followUpPrompts: [],
        handoffType: null,
        pendingMemberAction: {
          kind: "COMPLETE_DAILY_RHYTHM",
          journeyId: "10-minutes-with-jesus",
          stepId: "rhythm-day-20",
          day: 20,
          label: "Mark today's Daily Rhythm complete",
          requiresConfirmation: true,
        },
      },
      "member-1",
      {
        completeStep: (async () => {
          calls += 1;
          return {} as never;
        }) as never,
      },
    );

    assert.equal(calls, 0);
    assert.equal(metadata?.pendingMemberAction?.kind, "COMPLETE_DAILY_RHYTHM");
    assert.match(metadata?.answer ?? "", /say yes|say no/i);
  });

  it("resolves a devotional to the first published day not yet completed", () => {
    const entries = [
      { status: "Published", dayNumber: 240, scripture: "Psalm 91" },
      { status: "Published", dayNumber: 241, scripture: "Psalm 92" },
      { status: "Draft", dayNumber: 242, scripture: "Psalm 93" },
    ];

    const entry = resolveCurrentDevotionalEntry(entries, [240]);

    assert.equal(entry?.dayNumber, 241);
    assert.equal(entry?.scripture, "Psalm 92");
  });

  it("resolves a date-allocated devotional by today's date even when it is completed", () => {
    const entries = [
      { status: "Published", dayNumber: 240, displayLabel: "28 August", scripture: "Psalm 91" },
      { status: "Published", dayNumber: 241, displayLabel: "29 August", scripture: "Psalm 92" },
      { status: "Published", dayNumber: 242, displayLabel: "30 August", scripture: "Psalm 93" },
    ];

    const entry = resolveDateAllocatedDevotionalEntry(
      entries,
      new Date("2026-08-28T22:30:00.000Z"),
      "Africa/Johannesburg",
    );

    assert.equal(entry?.dayNumber, 241);
    assert.equal(entry?.scripture, "Psalm 92");
  });

  it("supports generated date-label formats and ignores non-date labels", () => {
    const entries = [
      { status: "Published", dayNumber: 1, displayLabel: "28 Aug 2026" },
      { status: "Published", dayNumber: 2, displayLabel: "29/08" },
      { status: "Published", dayNumber: 3, displayLabel: "Easter Sunday" },
    ];

    const entry = resolveDateAllocatedDevotionalEntry(
      entries,
      new Date("2026-08-29T12:00:00.000Z"),
      "Africa/Johannesburg",
    );

    assert.equal(entry?.dayNumber, 2);
  });

  it("resolves a pronoun follow-up only from a previous verified resource action", async () => {
    const metadata = await resolveContextualFollowUp("Open it please", {
      scripture: null,
      nextStep: {
        action: "Untrusted legacy path",
        primaryButtonText: "Wrong",
        path: "https://example.com/wrong",
      },
      nextSteps: [],
      recommendations: [{
        type: "walk",
        title: "Coming to Jesus",
        resourceId: "walk-1",
        path: "/journey/walk-1/day/2",
      }],
      resourceRecommendations: [{
        resourceType: "walk",
        resourceId: "walk-1",
        reason: "Previously verified result.",
      }],
      resourceActions: [{
        kind: "OPEN",
        resourceType: "walk",
        resourceId: "walk-1",
        route: "/journey/walk-1/day/2",
      }],
      followUpPrompts: [],
      handoffType: null,
    });

    assert.equal(metadata?.nextStep?.path, "/journey/walk-1/day/2");
    assert.equal(metadata?.resourceActions?.[0]?.resourceId, "walk-1");
    assert.equal(metadata?.recommendations[0]?.title, "Coming to Jesus");
  });

  it("recalls a previously verified Walk recommendation in natural member language", async () => {
    const metadata = await resolveContextualFollowUp("Show me the Walk you recommended yesterday.", {
      scripture: null,
      nextStep: null,
      nextSteps: [],
      recommendations: [{
        type: "walk",
        title: "Coming to Jesus",
        resourceId: "walk-1",
        path: "/journey/walk-1/day/2",
      }],
      resourceRecommendations: [{
        resourceType: "walk",
        resourceId: "walk-1",
        reason: "Previously verified result.",
      }],
      resourceActions: [{
        kind: "OPEN",
        resourceType: "walk",
        resourceId: "walk-1",
        route: "/journey/walk-1/day/2",
      }],
      followUpPrompts: [],
      handoffType: null,
    });

    assert.equal(metadata?.nextStep?.path, "/journey/walk-1/day/2");
    assert.equal(metadata?.recommendations[0]?.title, "Coming to Jesus");
    assert.equal(metadata?.resourceActions?.[0]?.resourceType, "walk");
  });

  it("does not turn client or model prose paths into contextual actions", async () => {
    const metadata = await resolveContextualFollowUp("Open it", {
      scripture: null,
      nextStep: {
        action: "Open an unverified destination",
        primaryButtonText: "Open",
        path: "/admin",
      },
      nextSteps: [],
      recommendations: [],
      followUpPrompts: [],
      handoffType: null,
    });

    assert.equal(metadata, null);
  });

  it("uses the previous verified Scripture reference for next-chapter follow-ups", async () => {
    const metadata = await resolveContextualFollowUp("Read the next chapter", {
      scripture: {
        reference: "John 3",
        book: "john",
        chapter: 3,
      },
      scriptureReferences: [{
        reference: "John 3",
        book: "john",
        chapter: 3,
      }],
      nextStep: null,
      nextSteps: [],
      recommendations: [],
      followUpPrompts: [],
      handoffType: null,
    });

    assert.equal(metadata?.scripture?.reference, "John 4");
    assert.equal(metadata?.nextStep?.path, "/bible/read/john/4");
  });

  it("fails closed when a canonical Emmaus action source is unavailable", () => {
    const metadata = canonicalFailureMetadata({
      intent: "DIRECT_ACTION",
      requestedCapability: "walks",
      requestedOperation: "CONTINUE",
      confidence: 0.99,
      clarificationRequired: false,
    });

    assert.match(metadata.answer ?? "", /couldn't safely access/i);
    assert.deepEqual(metadata.retrievalFailures, ["walks"]);
    assert.equal(metadata.nextStep, null);
    assert.equal(metadata.recommendations.length, 0);
  });
});