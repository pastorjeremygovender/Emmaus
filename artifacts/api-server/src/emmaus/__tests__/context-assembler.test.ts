import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assembleJarvisContext,
  type JarvisContextReaders,
} from "../context-assembler.ts";

function healthyReaders(): JarvisContextReaders {
  return {
    readDisplayName: async () => "Member",
    getDailyRhythmState: async () => null,
    getProgress: async () => null,
    listPublishedJourneys: async () => [],
    listSteps: async () => [],
    getBibleData: async () => null,
    getAllProgressForUser: async () => [],
    getSeriesById: async () => null,
    listPublishedSeries: async () => [],
    getPublishedSermonById: async () => null,
  };
}

describe("Jarvis context assembly", () => {
  it("keeps healthy context when individual sources fail", async () => {
    const readers = healthyReaders();
    readers.getDailyRhythmState = async () => {
      throw new Error("daily rhythm unavailable");
    };
    readers.getBibleData = async () => {
      throw new Error("bible unavailable");
    };
    readers.getAllProgressForUser = async () => {
      throw new Error("devotional progress unavailable");
    };

    const envelope = await assembleJarvisContext("member-a", undefined, readers);
    const statuses = new Map(
      envelope.context.sourceStatuses.map((source) => [source.source, source.status]),
    );

    assert.equal(envelope.schemaVersion, "jarvis.context.v1");
    assert.equal(envelope.scope, "authenticated-user");
    assert.equal(envelope.context.identity.displayName, "Member");
    assert.deepEqual(envelope.context.activeProgress, []);
    assert.deepEqual(envelope.context.completedProgress, []);
    assert.equal(envelope.context.bible, undefined);
    assert.equal(statuses.get("daily-rhythm"), "unavailable");
    assert.equal(statuses.get("bible"), "unavailable");
    assert.equal(statuses.get("devotional"), "unavailable");
    assert.equal(statuses.get("sermon"), "empty");
    assert.equal(JSON.stringify(envelope).includes("unavailable"), true);
    assert.equal(JSON.stringify(envelope).includes("daily rhythm unavailable"), false);
  });

  it("grounds today's Scripture questions in the member's published Daily Rhythm step", async () => {
    const readers = healthyReaders();
    readers.getDailyRhythmState = async () => ({
      journeyId: "10-minutes-with-jesus",
      currentStepId: "rhythm-day-20",
      currentDayNumber: 20,
      currentStepTitle: "You Can Trust His Voice",
      currentStepCompleted: false,
      nextStepLocked: false,
      nextEligibleUnlockDate: null,
    } as never);
    readers.listSteps = async () => ([{
      id: "rhythm-day-20",
      day: 20,
      title: "You Can Trust His Voice",
      status: "Published",
      scripture: "John 10:27–30",
      devotional: "Jesus describes His people as those who hear His voice and follow Him.",
      reflectionQuestion: "Where is Jesus inviting you to trust Him?",
      prayerPrompt: "Jesus, help me recognise and trust Your voice.",
      isCompletionStep: false,
    }] as never);

    const envelope = await assembleJarvisContext("member-a", undefined, readers);

    assert.equal(envelope.context.dailyRhythm?.scriptureReference, "John 10:27–30");
    assert.match(envelope.context.dailyRhythm?.teachingExcerpt ?? "", /hear His voice/i);
    assert.match(envelope.context.dailyRhythm?.reflectionQuestion ?? "", /trust Him/i);
    assert.match(envelope.context.dailyRhythm?.prayerPrompt ?? "", /recognise/i);
  });

  it("includes active legacy core Walks and completed discipleship activity", async () => {
    const readers = healthyReaders();
    readers.listPublishedJourneys = async () => ([
      {
        id: "legacy-core-walk",
        title: "Coming to Jesus",
        journeyType: "core",
        durationDays: 5,
      },
      {
        id: "completed-journey",
        title: "Growing in Christ",
        journeyType: "journey",
        durationDays: 3,
      },
    ] as never);
    readers.getProgress = async (_userId, journeyId) => ({
      status: "active",
      currentDay: journeyId === "legacy-core-walk" ? 2 : 3,
      completedDays: journeyId === "legacy-core-walk" ? [1] : [1, 2, 3],
    } as never);
    readers.listSteps = async (journeyId) => ([
      {
        id: `${journeyId}-day-2`,
        day: 2,
        title: "Who is Jesus?",
        status: "Published",
        isCompletionStep: false,
      },
    ] as never);

    const envelope = await assembleJarvisContext("member-a", undefined, readers);

    assert.deepEqual(envelope.context.activeProgress, [{
      journeyId: "legacy-core-walk",
      journeyType: "walk",
      title: "Coming to Jesus",
      currentDay: 2,
      stepId: "legacy-core-walk-day-2",
      stepTitle: "Who is Jesus?",
      route: "/journey/legacy-core-walk/day/2",
    }]);
    assert.deepEqual(envelope.context.completedProgress, [{
      journeyId: "completed-journey",
      journeyType: "journey",
      title: "Growing in Christ",
      route: "/journeys/completed-journey",
    }]);
    assert.equal(
      envelope.context.sourceStatuses.find((source) => source.source === "active-progress")?.status,
      "ok",
    );
  });

  it("passes the authenticated subject to every owner-scoped reader", async () => {
    const seenUserIds = new Set<string>();
    const readers = healthyReaders();
    readers.readDisplayName = async (userId) => {
      seenUserIds.add(userId);
      return undefined;
    };
    readers.getDailyRhythmState = async (userId) => {
      seenUserIds.add(userId);
      return null;
    };
    readers.getProgress = async (userId) => {
      seenUserIds.add(userId);
      return null;
    };
    readers.getBibleData = async (userId) => {
      seenUserIds.add(userId);
      return null;
    };
    readers.getAllProgressForUser = async (userId) => {
      seenUserIds.add(userId);
      return [];
    };

    await assembleJarvisContext("verified-member-42", undefined, readers);
    assert.deepEqual([...seenUserIds], ["verified-member-42"]);
  });
});
