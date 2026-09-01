import { getApiUrl } from "./api";

export type ReorderResource =
  | "sermon"
  | "collection"
  | "journey"
  | "devotional-series"
  | "devotional-entry"
  | "devotional-entry-group";

export type JourneyReorderScope = "library" | "collection" | "standalone";

/**
 * Move one item among the visible subset while preserving the positions and
 * relative order of items hidden by a filter.
 */
export function moveVisibleOrder(
  fullIds: string[],
  visibleIds: string[],
  id: string,
  direction: -1 | 1,
): string[] {
  const visibleIndex = visibleIds.indexOf(id);
  const swapIndex = visibleIndex + direction;
  if (visibleIndex < 0 || swapIndex < 0 || swapIndex >= visibleIds.length) return fullIds;

  const nextVisible = [...visibleIds];
  [nextVisible[visibleIndex], nextVisible[swapIndex]] = [nextVisible[swapIndex], nextVisible[visibleIndex]];
  const visibleSet = new Set(visibleIds);
  let nextIndex = 0;
  return fullIds.map(candidate => visibleSet.has(candidate) ? nextVisible[nextIndex++] : candidate);
}

export async function reorderContent(
  resourceType: ReorderResource,
  orderedIds: string[],
  options?: { parentId?: string; scope?: JourneyReorderScope },
): Promise<string[]> {
  const response = await fetch(getApiUrl("/api/admin/reorder"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceType, orderedIds, ...options }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `Reorder failed (${response.status})`);
  }
  const data = await response.json() as { orderedIds?: string[] };
  return data.orderedIds ?? orderedIds;
}