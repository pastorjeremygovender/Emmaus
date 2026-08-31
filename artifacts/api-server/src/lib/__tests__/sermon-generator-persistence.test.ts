/**
 * Regression coverage for the audio-first generation persistence boundary.
 *
 * The processing stage is the editor's synchronization signal. It must not
 * become terminal until the companion header and all five entries are durable.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const sourcePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "sermon-generator.ts",
);
const source = readFileSync(sourcePath, "utf8");

describe("audio-first companion persistence", () => {
  it("does not signal READY_FOR_REVIEW before the companion replacement is committed", () => {
    const audioFirstStart = source.indexOf(
      "export async function generateSermonContentFromTranscript",
    );
    assert.notEqual(audioFirstStart, -1);

    const audioFirstSource = source.slice(audioFirstStart);
    const companionCreate = audioFirstSource.indexOf("await replaceCompanionForSermon({");
    const terminalStage = audioFirstSource.indexOf(
      'processingStage: "READY_FOR_REVIEW"',
    );

    assert.notEqual(companionCreate, -1);
    assert.notEqual(terminalStage, -1);
    assert.ok(
      companionCreate < terminalStage,
      "the companion must be persisted before the editor is told generation is ready",
    );
  });

  it("keeps the intermediate companion stage non-terminal", () => {
    const audioFirstStart = source.indexOf(
      "export async function generateSermonContentFromTranscript",
    );
    const audioFirstSource = source.slice(audioFirstStart);

    assert.match(audioFirstSource, /processingStage:\s+"companion"/);
    assert.match(
      audioFirstSource,
      /Only expose the terminal stage after both the sermon fields and its\s+\/\/ companion/,
    );
  });

  it("requires all five generated days before audio-first replacement", () => {
    const audioFirstStart = source.indexOf(
      "export async function generateSermonContentFromTranscript",
    );
    const audioFirstSource = source.slice(audioFirstStart);

    assert.match(audioFirstSource, /companionDraft\.days\.length !== EXPECTED_GENERATED_COMPANION_DAYS/);
    assert.match(audioFirstSource, /expectedDays:\s+EXPECTED_GENERATED_COMPANION_DAYS/);
  });

  it("does not delete the old companion before the replacement transaction", () => {
    const audioFirstStart = source.indexOf(
      "export async function generateSermonContentFromTranscript",
    );
    const audioFirstSource = source.slice(audioFirstStart);

    assert.equal(
      audioFirstSource.indexOf("deleteCompanion("),
      -1,
      "audio-first must use the rollback-safe replacement store operation",
    );
  });
});