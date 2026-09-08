/**
 * Contracts shared by the Voice transport and the canonical Emmaus service.
 *
 * Voice is a presentation layer, not a second assistant. These types make the
 * boundary explicit: the browser may describe where it is, but the server
 * decides which identity, route, tenant, and follow-up references are trusted.
 */

import type { EntryPoint } from "./firestore-model.js";

export interface VoiceLocationHint {
  pathname?: unknown;
  entryPoint?: unknown;
}

export interface VoiceContextEnvelope {
  schemaVersion: "emmaus.voice.v1";
  requestId: string;
  verifiedUser: {
    id: string;
    role: string;
  };
  church: {
    id: "icc";
    name: "Isipingo Community Church";
  };
  location: {
    pathname: string;
    entryPoint: EntryPoint;
    source: "validated-client-hint";
  } | null;
  activity: {
    isReading: boolean;
    hasJustReadContent: boolean;
  };
  authority: {
    content: "server-catalogue";
    routes: "server-generated";
    safety: "canonical-emmaus";
  };
}

export interface VoiceConversationRequest {
  message?: unknown;
  history?: unknown;
  context?: Record<string, unknown>;
  /** Bounded UI-state hint; never an authority for identity, routes, or access. */
  voiceAppContext?: unknown;
  currentPath?: unknown;
  isReading?: unknown;
  lastReadContext?: unknown;
}

const ENTRY_POINTS = new Set<EntryPoint>([
  "bible",
  "walk",
  "journeys",
  "sermons",
  "personal",
  "standalone",
]);

function validatedPathname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  // Only same-origin application paths may enter the context envelope.
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 240) return null;
  if (/[\u0000-\u001f<>]/.test(path)) return null;
  return path;
}

function validatedEntryPoint(value: unknown): EntryPoint {
  return typeof value === "string" && ENTRY_POINTS.has(value as EntryPoint)
    ? value as EntryPoint
    : "standalone";
}

export function buildVoiceContextEnvelope(input: {
  requestId: string;
  userId: string;
  role: string;
  currentPath?: unknown;
  entryPoint?: unknown;
  isReading?: unknown;
  lastReadContext?: unknown;
}): VoiceContextEnvelope {
  const pathname = validatedPathname(input.currentPath);
  const lastReadContext =
    typeof input.lastReadContext === "string" ? input.lastReadContext.trim().slice(0, 4000) : "";

  return {
    schemaVersion: "emmaus.voice.v1",
    requestId: input.requestId,
    verifiedUser: { id: input.userId, role: input.role },
    church: { id: "icc", name: "Isipingo Community Church" },
    location: pathname
      ? {
          pathname,
          entryPoint: validatedEntryPoint(input.entryPoint),
          source: "validated-client-hint",
        }
      : null,
    activity: {
      isReading: input.isReading === true,
      hasJustReadContent: Boolean(lastReadContext),
    },
    authority: {
      content: "server-catalogue",
      routes: "server-generated",
      safety: "canonical-emmaus",
    },
  };
}

/**
 * Keep history bounded and remove malformed browser-provided messages before
 * they reach the canonical service.
 */
export function normalizeVoiceHistory(value: unknown): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { role: string; content: string } =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as { role?: unknown }).role === "string" &&
      typeof (item as { content?: unknown }).content === "string" &&
      ((item as { role: string }).role === "user" || (item as { role: string }).role === "assistant"),
    )
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: item.content.trim().slice(0, 6000),
    }))
    .filter((item) => item.content.length > 0)
    .slice(-10);
}

export function normalizeVoiceAppContext(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/https?:\/\/\S+|(?:^|\s)\/(?:api\/)?[^\s]+/gi, " ")
    .replace(/(?:journey|series|companion|sermon|step|entry)[_-]?[a-z0-9-]{8,}/gi, "[content]")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 6000);
}