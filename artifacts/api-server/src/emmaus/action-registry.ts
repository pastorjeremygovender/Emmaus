import type { EmmausResource, EmmausResourceType } from "./resource-catalogue.js";

export type EmmausActionKind = "OPEN" | "READ" | "CONTINUE";

export interface EmmausResourceAction {
  kind: EmmausActionKind;
  resourceType: EmmausResourceType;
  resourceId: string;
  parentId?: string;
  route: string;
}

export interface ActionResolutionRequest {
  authenticated: boolean;
  tenantId: string;
  kind: EmmausActionKind;
  resourceType: EmmausResourceType;
  resourceId: string;
  parentId?: string;
}

export type ActionResolution =
  | { ok: true; action: EmmausResourceAction }
  | { ok: false; code: "UNAUTHENTICATED" | "TENANT_REQUIRED" | "RESOURCE_NOT_ELIGIBLE" | "RESOURCE_ID_MISMATCH" };

const ROUTE_PATTERN =
  /^\/(?:journeys|journey|devotional|sermon-companion|sermon|bible\/read|daily-rhythm)\/[A-Za-z0-9_:/?-]+$/;

/**
 * The catalogue is already built from published, tenant-scoped server stores.
 * This registry is the one place where a model/resource match becomes an
 * executable action. It never accepts a route or media URL from the model.
 */
export function actionsForResource(resource: EmmausResource): EmmausResourceAction[] {
  if (!ROUTE_PATTERN.test(resource.route)) return [];
  const base = {
    resourceType: resource.type,
    resourceId: resource.resourceId,
    ...(resource.parentId ? { parentId: resource.parentId } : {}),
    route: resource.route,
  };
  const actions: EmmausResourceAction[] = [
    { ...base, kind: "OPEN" },
    { ...base, kind: "READ" },
  ];
  if (["walk", "walk_step", "journey", "daily-rhythm", "devotional", "sermon-companion", "bible-study"].includes(resource.type)) {
    actions.push({ ...base, kind: "CONTINUE" });
  }
  return actions;
}

export function resolveCatalogueAction(
  request: ActionResolutionRequest,
  resources: EmmausResource[],
): ActionResolution {
  if (!request.authenticated) return { ok: false, code: "UNAUTHENTICATED" };
  if (!request.tenantId.trim()) return { ok: false, code: "TENANT_REQUIRED" };
  const resource = resources.find((candidate) =>
    candidate.type === request.resourceType &&
    candidate.resourceId === request.resourceId &&
    (!request.parentId || candidate.parentId === request.parentId),
  );
  if (!resource) return { ok: false, code: "RESOURCE_NOT_ELIGIBLE" };
  const action = actionsForResource(resource).find((candidate) => candidate.kind === request.kind);
  if (!action) return { ok: false, code: "RESOURCE_ID_MISMATCH" };
  return { ok: true, action };
}