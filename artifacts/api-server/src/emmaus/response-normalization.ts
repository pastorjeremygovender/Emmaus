import type {
  EmmausResponseMetadata,
  EmmausResourceType,
  Recommendation,
  SermonRecommendation,
} from "./firestore-model.js";
import {
  extractValidatedScriptureReferences,
  normalizeValidatedScriptureProse,
  stripModelUrls,
  validateCitations,
} from "./citation-validation.js";
import type { EmmausResource } from "./resource-catalogue.js";
import { buildJarvisResponseContract } from "./jarvis-contract.js";

const MAX_DISPLAY_CHARS = 1600;
const MAX_SPEAKABLE_CHARS = 560;

type ResourceForGrounding = Pick<
  EmmausResource,
  "type" | "resourceId" | "parentId" | "title" | "route" | "relevanceReasons"
>;

export interface StreamingGrounding {
  resources?: ResourceForGrounding[];
  sermonRecommendations?: SermonRecommendation[];
  unresolvedSources?: string[];
}

export interface NormalizedEmmausResponse {
  metadata: EmmausResponseMetadata;
  displayAnswer: string;
  speakableAnswer: string;
}

function canonicalType(type: string): EmmausResourceType | null {
  const aliases: Record<string, EmmausResourceType> = {
    "sermon-companion": "sermon_companion",
    "bible-study": "bible_study",
    "daily-rhythm": "daily_rhythm",
    journey: "journey",
    walk: "walk",
    "walk-step": "walk_step",
    devotional: "devotional",
    sermon: "sermon",
    sermon_companion: "sermon_companion",
    bible_study: "bible_study",
    daily_rhythm: "daily_rhythm",
    walk_step: "walk_step",
  };
  return aliases[type.toLowerCase()] ?? null;
}

function resourceKey(item: {
  type?: string;
  resourceId?: string;
  sermonId?: string;
  path?: string;
  title?: string;
}): string {
  const type = canonicalType(String(item.type ?? "")) ?? String(item.type ?? "").toLowerCase();
  const id = item.resourceId ?? item.sermonId ?? item.path ?? `${item.title ?? ""}`;
  return `${type}:${id}`;
}

function dedupeRecommendations(items: Recommendation[]): Recommendation[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (item.type === "sermon" || item.type === "pastor" || item.type === "prayer") return false;
    const key = resourceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 2);
}

function dedupeSermons(items: SermonRecommendation[]): SermonRecommendation[] {
  const bySermon = new Map<string, SermonRecommendation>();
  for (const item of items) {
    const previous = bySermon.get(item.sermonId);
    if (!previous || (previous.source === "archive" && item.source === "canonical")) {
      bySermon.set(item.sermonId, item);
    }
  }
  return Array.from(bySermon.values()).slice(0, 1);
}

function dedupeActions(metadata: EmmausResponseMetadata): void {
  const seen = new Set<string>();
  metadata.resourceActions = (metadata.resourceActions ?? []).filter((action) => {
    const key = `${action.kind}:${action.resourceType}:${action.resourceId}:${action.parentId ?? ""}:${action.route}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const capabilitySeen = new Set<string>();
  metadata.capabilityActions = (metadata.capabilityActions ?? []).filter((action) => {
    const key = `${action.kind}:${action.capabilityId}:${action.route}`;
    if (capabilitySeen.has(key)) return false;
    capabilitySeen.add(key);
    return true;
  });
}

function sentenceParts(text: string): string[] {
  return text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu)?.map((part) => part.trim()).filter(Boolean) ?? [];
}

export function stripUnverifiedSermonMentions(
  text: string,
  sermons: SermonRecommendation[] = [],
): string {
  if (sermons.length > 0) return text;
  return sentenceParts(text)
    .filter((sentence) => !/\b(?:sermon|preach(?:ed|es|ing)?|preacher)\b/i.test(sentence))
    .join(" ");
}

function hasResourceType(resources: ResourceForGrounding[], types: EmmausResourceType[]): boolean {
  return resources.some((resource) => types.includes(canonicalType(resource.type) ?? resource.type as EmmausResourceType));
}

/**
 * Remove only resource-specific claims that lack an associated verified record.
 * General suggestions remain safe and useful; named or possessive claims do not.
 */
function groundResourceClaims(
  answer: string,
  resources: ResourceForGrounding[],
  sermons: SermonRecommendation[],
  unresolvedSources: string[] = [],
): string {
  const knownTitles = new Set([
    ...resources.map((resource) => resource.title.toLowerCase()),
    ...sermons.map((sermon) => sermon.title.toLowerCase()),
  ]);
  const knownSpeakers = sermons
    .map((sermon) => sermon.speaker.toLowerCase())
    .filter((speaker) => speaker.length >= 2);
  const resourceNamePattern = /\b((?:[A-Z][\w'’-]*\s+){0,5}(?:Walk|Journey|Devotional|Bible Study|Sermon Companion))\b/g;
  const speakerNamePattern = /\b(?:Pastor|Rev\.?|Reverend|Speaker|Preacher)\s+[A-Za-z][\w'’-]*(?:\s+[A-Za-z][\w'’-]*){0,3}\b/gi;
  const isKnownTitle = (candidate: string) => {
    const name = candidate.toLowerCase().trim();
    if (/^(?:a|an|the|my|your)\s+/i.test(name)) return true;
    return Array.from(knownTitles).some((title) => title === name || title.includes(name));
  };

  return sentenceParts(answer)
    .map((sentence) => sentence.trim())
    .flatMap((sentence) => {
      const lower = sentence.toLowerCase();
      if (/\bpastor jeremy\b/i.test(sentence) && sermons.length === 0) return [];

      const namedSpeakers = Array.from(sentence.matchAll(speakerNamePattern), (match) => match[0]);
      if (namedSpeakers.length > 0 && !knownSpeakers.some((speaker) => lower.includes(speaker))) return [];

      const namedResources = Array.from(sentence.matchAll(resourceNamePattern), (match) => match[1]);
      if (namedResources.some((name) => !isKnownTitle(name))) {
        return unresolvedSources.length > 0
          ? ["I couldn't verify that Emmaus resource right now."]
          : [];
      }

      const titleMentioned = Array.from(knownTitles).some((title) =>
        title.length >= 4 && lower.includes(title),
      );
      if (titleMentioned) return [sentence];

      // A model may name an invented resource without an article, for example
      // "Try the Ember Journey". Keep only names that match the verified title
      // set; generic "a Walk" claims are handled by the type check below.
      const namedResource = sentence.match(
        /\b([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*){0,5})\s+(Walk|Journey|Devotional|Bible Study|Sermon Companion)\b/,
      );
      if (namedResource && !titleMentioned) {
        return unresolvedSources.length > 0
          ? ["I couldn't verify that Emmaus resource right now."]
          : [];
      }

      const specificResourceClaim =
        /\b(?:this|the|a|an|my|your|emmaus(?:'s)?|in emmaus)\s+(?:emmaus\s+)?(?:walk|journey|devotional(?: series)?|bible study|sermon|sermon companion)\b/i.test(sentence);
      if (!specificResourceClaim) return [sentence];

      if (unresolvedSources.length > 0) {
        return ["I couldn't verify that Emmaus resource right now."];
      }

      return (
        (/\bwalk\b/i.test(sentence) && hasResourceType(resources, ["walk", "walk_step"])) ||
        (/\bjourney\b/i.test(sentence) && hasResourceType(resources, ["journey"])) ||
        (/\bdevotional/i.test(sentence) && hasResourceType(resources, ["devotional", "daily_rhythm"])) ||
        (/\bbible study\b/i.test(sentence) && hasResourceType(resources, ["bible_study"])) ||
        (/\bsermon|sermon companion\b/i.test(sentence) && sermons.length > 0)
      ) ? [sentence] : [];
    })
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function conciseDisplayAnswer(answer: string): string {
  const normalized = answer
    .replace(/\r/g, "")
    .replace(/<EMMAUS_META[\s\S]*$/gi, "")
    .replace(/<\/?EMMAUS_META>/gi, "")
    .replace(/https?:\/\/[^\s)\]}"']+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (normalized.length <= MAX_DISPLAY_CHARS) return normalized;
  const shortened = normalized.slice(0, MAX_DISPLAY_CHARS);
  const boundary = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("! "), shortened.lastIndexOf("? "));
  return (boundary >= 500 ? shortened.slice(0, boundary + 1) : shortened).trim();
}

function speakableAnswer(answer: string): string {
  const plain = answer
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[*_`>#]/g, "")
    .replace(/\b(?:Preached Here|Open in My Bible|Read today's step|Watch sermon)\b:?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (plain.length <= MAX_SPEAKABLE_CHARS) return plain;
  const shortened = plain.slice(0, MAX_SPEAKABLE_CHARS);
  const boundary = Math.max(shortened.lastIndexOf(". "), shortened.lastIndexOf("! "), shortened.lastIndexOf("? "));
  return (boundary >= 180 ? shortened.slice(0, boundary + 1) : shortened).trim();
}

/**
 * Normalize one complete typed-stream unit with the same citation and resource
 * grounding rules as the final response. It intentionally has no fallback or
 * length truncation: the final full-answer normalizer remains authoritative.
 */
export function normalizeEmmausStreamingUnit(
  answer: string,
  grounding: StreamingGrounding = {},
): string {
  const normalized = stripUnverifiedSermonMentions(
    stripModelUrls(normalizeValidatedScriptureProse(answer)),
    grounding.sermonRecommendations ?? [],
  );
  const grounded = grounding.resources
    ? groundResourceClaims(
        normalized,
        grounding.resources,
        grounding.sermonRecommendations ?? [],
        grounding.unresolvedSources,
      )
    : normalized;
  return grounded.replace(/\s{2,}/g, " ").trim();
}

function normalizeFollowUps(prompts: string[]): string[] {
  const seen = new Set<string>();
  return prompts
    .map((prompt) => prompt.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim())
    .filter((prompt) => prompt.length >= 8 && prompt.length <= 140)
    .filter((prompt) => {
      const key = prompt.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

export function normalizeEmmausResponse(input: {
  answer: string;
  metadata: EmmausResponseMetadata;
  resources?: ResourceForGrounding[];
  unresolvedSources?: string[];
}): NormalizedEmmausResponse {
  const normalizedInputAnswer = stripModelUrls(normalizeValidatedScriptureProse(input.answer));
  const metadata = input.resources
    ? validateCitations(input.metadata, input.resources as EmmausResource[])
    : { ...input.metadata };
  const proseReferences = extractValidatedScriptureReferences(normalizedInputAnswer);
  const scriptureReferences = Array.from(
    new Map(
      [...(metadata.scriptureReferences ?? []), ...proseReferences]
        .filter(Boolean)
        .map((reference) => [reference.reference.toLowerCase(), reference] as const),
    ).values(),
  );
  metadata.scriptureReferences = scriptureReferences;
  metadata.scripture = metadata.scripture
    ? metadata.scripture
    : scriptureReferences[0] ?? null;

  metadata.recommendations = dedupeRecommendations(metadata.recommendations ?? []);
  metadata.sermonRecommendations = dedupeSermons(metadata.sermonRecommendations ?? []);
  if (metadata.sermonRecommendations.length > 0) {
    metadata.recommendations = metadata.recommendations.slice(0, 1);
  }
  metadata.resourceRecommendations = metadata.recommendations
    .filter((recommendation) => recommendation.resourceId)
    .map((recommendation) => {
      const type = canonicalType(String(recommendation.type)) ?? "journey";
      const match = input.resources?.find((resource) =>
        resource.resourceId === recommendation.resourceId &&
        canonicalType(resource.type) === type,
      );
      return {
        resourceType: type,
        resourceId: recommendation.resourceId!,
        ...(recommendation.parentId ? { parentId: recommendation.parentId } : {}),
        reason: recommendation.description?.slice(0, 240) ?? "Relevant published Emmaus resource.",
        ...(match?.relevanceReasons?.length
          ? { relevanceReasons: match.relevanceReasons.slice(0, 8) }
          : {}),
      };
    });
  metadata.nextSteps = Array.from(
    new Map((metadata.nextSteps ?? []).map((step) => [
      `${step.type ?? "step"}:${step.path ?? step.text}`,
      step,
    ])).values(),
  ).slice(0, 4);
  metadata.followUpPrompts = normalizeFollowUps(metadata.followUpPrompts ?? []);
  dedupeActions(metadata);

  const grounded = input.resources
    ? groundResourceClaims(
        normalizedInputAnswer,
        input.resources,
        metadata.sermonRecommendations ?? [],
        input.unresolvedSources,
      )
    : normalizedInputAnswer;
  const displayAnswer = conciseDisplayAnswer(
    grounded || "I couldn't verify that Emmaus resource. I can still help you explore the Scripture behind your question.",
  );
  const spoken = speakableAnswer(displayAnswer);
  metadata.answer = displayAnswer;
  metadata.displayAnswer = displayAnswer;
  metadata.speakableAnswer = spoken;
  metadata.jarvis = buildJarvisResponseContract({
    intent: metadata.jarvisIntent,
    pastoralText: displayAnswer,
    metadata,
  });
  return { metadata, displayAnswer, speakableAnswer: spoken };
}