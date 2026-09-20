import assert from "node:assert/strict";
import test from "node:test";
import { actionsForResource, resolveCatalogueAction } from "../action-registry.ts";
import type { EmmausResource } from "../resource-catalogue.ts";

const resource: EmmausResource = {
  type: "sermon-companion",
  resourceId: "comp-1",
  title: "Prayer Companion",
  route: "/sermon-companion/comp-1/overview",
  excerpts: [],
  provenance: "Published Sermon Companion",
  relevance: 4,
};

test("action registry emits only server-owned routes and supported actions", () => {
  assert.deepEqual(
    actionsForResource(resource).map((action) => action.kind),
    ["OPEN", "READ", "CONTINUE"],
  );
  assert.ok(actionsForResource(resource).every((action) => action.route === resource.route));
});

test("action resolution requires identity, tenant, and an exact eligible resource", () => {
  assert.equal(resolveCatalogueAction({
    authenticated: false, tenantId: "icc", kind: "OPEN",
    resourceType: resource.type, resourceId: resource.resourceId,
  }, []).ok, false);
  assert.equal(resolveCatalogueAction({
    authenticated: true, tenantId: "", kind: "OPEN",
    resourceType: resource.type, resourceId: resource.resourceId,
  }, []).ok, false);
  assert.equal(resolveCatalogueAction({
    authenticated: true, tenantId: "icc", kind: "OPEN",
    resourceType: resource.type, resourceId: "wrong",
  }, [resource]).ok, false);
  assert.deepEqual(resolveCatalogueAction({
    authenticated: true, tenantId: "icc", kind: "CONTINUE",
    resourceType: resource.type, resourceId: resource.resourceId,
  }, [resource]), {
    ok: true,
    action: {
      kind: "CONTINUE",
      resourceType: "sermon-companion",
      resourceId: "comp-1",
      route: "/sermon-companion/comp-1/overview",
    },
  });
});