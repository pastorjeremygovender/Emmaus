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
    assert.equal(envelope.context.bible, undefined);
    assert.equal(statuses.get("daily-rhythm"), "unavailable");
    assert.equal(statuses.get("bible"), "unavailable");
    assert.equal(statuses.get("devotional"), "unavailable");
    assert.equal(statuses.get("sermon"), "empty");
    assert.equal(JSON.stringify(envelope).includes("unavailable"), true);
    assert.equal(JSON.stringify(envelope).includes("daily rhythm unavailable"), false);
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