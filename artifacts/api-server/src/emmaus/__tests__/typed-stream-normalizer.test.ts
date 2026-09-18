import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTypedStreamConsumer,
  takeSafeTextUnits,
} from "../typed-stream-normalizer.ts";

const walk = {
  type: "journey" as const,
  resourceId: "prodigal-welcome",
  title: "Prodigal Welcome Journey",
  route: "/journeys/prodigal-welcome",
  excerpts: [],
  provenance: "Published Journey",
  relevance: 5,
};

describe("typed Ask Emmaus safe incremental normalizer", () => {
  it("holds split Bible references until the complete sentence arrives", () => {
    const first = takeSafeTextUnits("Read John 3");
    assert.deepEqual(first.units, []);
    const second = takeSafeTextUnits(`${first.remainder}:16–18. Next.`);
    assert.deepEqual(second.units, ["Read John 3:16–18.", " Next."]);
    assert.equal(second.remainder, "");
  });

  it("handles numbered books, punctuation, and an unfinished final unit", () => {
    const consumerOutput: string[] = [];
    const consumer = createTypedStreamConsumer({}, (content) => consumerOutput.push(content));
    consumer.push("First Cor");
    consumer.push("inthians 13:4–7. A final thought");
    assert.deepEqual(consumerOutput, ["1 Corinthians 13:4–7. "]);
    consumer.flush();
    assert.deepEqual(consumerOutput, ["1 Corinthians 13:4–7. ", "A final thought "]);
  });

  it("does not split a Markdown link or a URL at internal punctuation", () => {
    const first = takeSafeTextUnits("[John 3:16](");
    assert.deepEqual(first.units, []);
    const second = takeSafeTextUnits(
      `${first.remainder}/bible/read/john/3?startVerse=16). Continue.`,
    );
    assert.deepEqual(second.units, [
      "[John 3:16](/bible/read/john/3?startVerse=16).",
      " Continue.",
    ]);
  });

  it("normalizes valid references and removes malformed references before emission", () => {
    const output: string[] = [];
    const consumer = createTypedStreamConsumer({}, (content) => output.push(content));
    consumer.push("Faith is grounded in john 3:16. This is John 999:1.");
    consumer.flush();
    assert.deepEqual(output, ["Faith is grounded in John 3:16. ", "This is . "]);
    assert.ok(output.every((content) => !content.includes("999")));
  });

  it("keeps verified resources and drops invented resource claims", () => {
    const output: string[] = [];
    const consumer = createTypedStreamConsumer({ resources: [walk] }, (content) => output.push(content));
    consumer.push("The Prodigal Welcome Journey may help. Try the Ember Journey.");
    consumer.flush();
    assert.deepEqual(output, ["The Prodigal Welcome Journey may help. "]);
    assert.equal(output.some((content) => content.includes("Ember")), false);
  });

  it("does not leak an unverified sermon sentence", () => {
    const output: string[] = [];
    const consumer = createTypedStreamConsumer({}, (content) => output.push(content));
    consumer.push("God meets us in our fear. Pastor Invented preached this sermon.");
    consumer.flush();
    assert.deepEqual(output, ["God meets us in our fear. "]);
  });
});