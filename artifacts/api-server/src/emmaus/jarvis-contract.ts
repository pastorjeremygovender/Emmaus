/**
 * Jarvis foundation contract.
 *
 * This is the typed boundary between authenticated Emmaus data and member
 * presentation. It deliberately separates pastoral prose, Scripture, Emmaus
 * content references, and executable actions. Routes are only ever populated
 * by server-owned resolvers.
 */

import type { HandoffType, EmmausResourceType, ScriptureRef } from "./firestore-model.js";

export const JARVIS_CONTRACT_VERSION = "jarvis.v1" as const;

export type JarvisIntent =
  | "TODAY"
  | "CONTINUE"
  | "DAILY_RHYTHM"
  | "DAILY_DEVOTIONAL"
  | "BIBLE_READ"
  | "SERMON_SEARCH"
  | "APP_HELP"
  | "ASK";

export type JarvisActionKind = "OPEN" | "READ" | "CONTINUE";

export interface JarvisContentReference {
  resourceType: EmmausResourceType;
  resourceId: string;
  parentId?: string;
  title: string;
  reason: string;
}

export interface JarvisAction {
  kind: JarvisActionKind;
  targetType: "capability" | "resource" | "scripture";
  targetId: string;
  label: string;
  route: string;
  resourceType?: EmmausResourceType;
  parentId?: string;
}

export interface JarvisResponseContract {
  contractVersion: typeof JARVIS_CONTRACT_VERSION;
  intent: JarvisIntent;
  pastoralText: string;
  scriptureReferences: ScriptureRef[];
  contentReferences: JarvisContentReference[];
  suggestedNextAction: JarvisAction | null;
  actions: JarvisAction[];
  handoffType: HandoffType;
  retrievalFailures: string[];
}

export interface JarvisSourceStatus {
  source:
    | "identity"
    | "daily-rhythm"
    | "active-progress"
    | "bible"
    | "devotional"
    | "sermon";
  status: "ok" | "unavailable" | "empty";
}

export interface JarvisContext {
  identity: {
    displayName?: string;
  };
  dailyRhythm?: {
    journeyId: string;
    currentDay: number;
    stepId?: string;
    stepTitle?: string;
    completedToday: boolean;
    locked: boolean;
    unlockDate?: string;
  };
  activeProgress: Array<{
    journeyId: string;
    journeyType: "walk" | "journey";
    title: string;
    currentDay: number;
    stepId?: string;
    stepTitle?: string;
    route: string;
  }>;
  bible?: {
    bookId: string;
    bookName: string;
    chapter: number;
    chapterHeading?: string;
    openedAt?: string;
  };
  devotional?: {
    seriesId: string;
    seriesTitle: string;
    currentDay: number;
    entryId?: string;
    entryTitle?: string;
    route: string;
  };
  sermon?: {
    sermonId: string;
    title: string;
    speaker: string;
    scriptureReference?: string;
    sermonDate?: string;
  };
  sourceStatuses: JarvisSourceStatus[];
}

export function buildJarvisResponseContract(input: {
  intent?: JarvisIntent;
  pastoralText: string;
  metadata: {
    scriptureReferences?: ScriptureRef[];
    recommendations?: Array<{
      type: string;
      title: string;
      resourceId?: string;
      parentId?: string;
      description?: string;
    }>;
    resourceActions?: Array<{
      kind: JarvisActionKind;
      resourceType: EmmausResourceType;
      resourceId: string;
      parentId?: string;
      route: string;
    }>;
    capabilityActions?: Array<{
      kind: JarvisActionKind;
      capabilityId: string;
      label: string;
      route: string;
    }>;
    nextStep?: { primaryButtonText: string; path: string } | null;
    handoffType: HandoffType;
    retrievalFailures?: string[];
  };
}): JarvisResponseContract {
  const contentReferences = (input.metadata.recommendations ?? [])
    .filter((recommendation) => recommendation.resourceId)
    .map((recommendation) => ({
      resourceType: recommendation.type as EmmausResourceType,
      resourceId: recommendation.resourceId!,
      ...(recommendation.parentId ? { parentId: recommendation.parentId } : {}),
      title: recommendation.title,
      reason: recommendation.description?.slice(0, 240) ?? "Relevant published Emmaus content.",
    }))
    .slice(0, 8);

  const actions: JarvisAction[] = [
    ...(input.metadata.capabilityActions ?? []).map((action) => ({
      kind: action.kind,
      targetType: "capability" as const,
      targetId: action.capabilityId,
      label: action.label,
      route: action.route,
    })),
    ...(input.metadata.resourceActions ?? []).map((action) => ({
      kind: action.kind,
      targetType: "resource" as const,
      targetId: action.resourceId,
      label: `${action.kind === "CONTINUE" ? "Continue" : action.kind === "READ" ? "Read" : "Open"} ${action.resourceType.replace(/_/g, " ")}`,
      route: action.route,
      resourceType: action.resourceType,
      ...(action.parentId ? { parentId: action.parentId } : {}),
    })),
  ];

  const suggestedNextAction = actions[0]
    ?? (input.metadata.nextStep?.path
      ? {
          kind: "OPEN" as const,
          targetType: "scripture" as const,
          targetId: input.metadata.nextStep.path,
          label: input.metadata.nextStep.primaryButtonText,
          route: input.metadata.nextStep.path,
        }
      : null);

  return {
    contractVersion: JARVIS_CONTRACT_VERSION,
    intent: input.intent ?? "ASK",
    pastoralText: input.pastoralText,
    scriptureReferences: input.metadata.scriptureReferences ?? [],
    contentReferences,
    suggestedNextAction,
    actions,
    handoffType: input.metadata.handoffType,
    retrievalFailures: Array.from(new Set(input.metadata.retrievalFailures ?? [])),
  };
}

export function emptyJarvisContract(
  intent: JarvisIntent = "ASK",
): JarvisResponseContract {
  return {
    contractVersion: JARVIS_CONTRACT_VERSION,
    intent,
    pastoralText: "",
    scriptureReferences: [],
    contentReferences: [],
    suggestedNextAction: null,
    actions: [],
    handoffType: null,
    retrievalFailures: [],
  };
}