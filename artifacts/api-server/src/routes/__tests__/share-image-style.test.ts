import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNewMethodPrompt,
  getShareImageStyle,
  getShareImageStyleDirection,
  type NewMethodReasoning,
} from "../share-image.js";

const reasoning: NewMethodReasoning = {
  emotionalCentre: "Trust",
  visualMetaphor: "A doorway opening onto morning light",
  composition: "The subject sits to the right with generous negative space for the quote",
  heroText: "Trust God",
  mood: "Quietly hopeful",
  avoid: ["generic stock photography"],
};

describe("share image style presets", () => {
  it("accepts every named style with its intended pipeline", () => {
    assert.equal(getShareImageStyle("dark-cinematic").pipeline, "art-direction");
    assert.equal(getShareImageStyle("light-floral").pipeline, "art-direction");
    assert.equal(getShareImageStyle("in-the-middle").pipeline, "visual-reasoning");
    assert.equal(getShareImageStyle("drama").pipeline, "art-direction");
  });

  it("falls back safely to the balanced style for an unknown style ID", () => {
    const fallback = getShareImageStyle("not-a-style");
    assert.equal(fallback.id, "in-the-middle");
    assert.equal(
      getShareImageStyleDirection("in-the-middle"),
      getShareImageStyleDirection(fallback.id),
    );
  });

  it("keeps each named direction in the generated visual-reasoning prompt", () => {
    const prompts = {
      "dark-cinematic": buildNewMethodPrompt("Trust God", reasoning, "dark-cinematic"),
      "light-floral": buildNewMethodPrompt("Trust God", reasoning, "light-floral"),
      "in-the-middle": buildNewMethodPrompt("Trust God", reasoning, "in-the-middle"),
      drama: buildNewMethodPrompt("Trust God", reasoning, "drama"),
    };

    assert.match(prompts["dark-cinematic"], /DARK AND CINEMATIC/);
    assert.match(prompts["dark-cinematic"], /moody, filmic visual language/);
    assert.match(prompts["light-floral"], /LIGHT AND FLORAL/);
    assert.match(prompts["light-floral"], /bright, airy, tender visual language/);
    assert.match(prompts["in-the-middle"], /IN THE MIDDLE/);
    assert.match(prompts["in-the-middle"], /balanced contemporary editorial visual language/);
    assert.match(prompts.drama, /DRAMA/);
    assert.match(prompts.drama, /dramatic, illustrative visual language/);
  });

  it("protects the balanced prompt from default plant and growth imagery", () => {
    const prompt = buildNewMethodPrompt("Trust God", reasoning, "in-the-middle");

    assert.match(prompt, /generic plant, seedling, leaf, vine, garden/);
    assert.match(prompt, /unless the quote explicitly depends on that idea/);
    assert.match(prompt, /Botanical or growth imagery is allowed only when the quote specifically calls for it/);
    assert.match(prompt, /must never be the default/);
  });
});