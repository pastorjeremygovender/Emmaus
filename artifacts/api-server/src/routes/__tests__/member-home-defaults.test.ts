/**
 * Regression coverage for the first Today's Steps bootstrap.
 *
 * Requires the API server to be running against the development database:
 *   NODE_ENV=test ALLOW_TEST_AUTH_HARNESS=1 \
 *   node --test --import=tsx/esm \
 *     src/routes/__tests__/member-home-defaults.test.ts
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const MEMBER = `member-home-defaults-${Date.now()}`;

type Defaults = {
  journeyIds: string[];
  devotionalSeriesIds: string[];
  companionIds: string[];
};

type InitializeResponse = {
  initialized: boolean;
  seeded: boolean;
  defaults: Defaults;
};

async function request(
  path: string,
  method = "POST",
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
  return { status: response.status, body: await response.text() };
}

function parse<T>(body: string): T {
  return JSON.parse(body) as T;
}

after(async () => {
  await cleanupTestAuth();
});

describe("member home default initialization", () => {
  it("seeds the requested content once and does not re-seed after removal", async () => {
    const headers = await authHeader(MEMBER);

    const first = await request("/api/member-home/initialize-defaults", "POST", headers);
    assert.equal(first.status, 200, first.body);
    const firstBody = parse<InitializeResponse>(first.body);

    assert.equal(firstBody.initialized, true);
    assert.equal(firstBody.seeded, true);
    assert.equal(firstBody.defaults.journeyIds.length, 3);
    assert.equal(firstBody.defaults.devotionalSeriesIds.length, 1);
    assert.equal(firstBody.defaults.companionIds.length, 1);

    for (const id of firstBody.defaults.journeyIds) {
      const removed = await request(
        `/api/engagements/journey/${encodeURIComponent(id)}/remove`,
        "POST",
        headers,
      );
      assert.equal(removed.status, 200, removed.body);
    }
    for (const id of firstBody.defaults.devotionalSeriesIds) {
      const removed = await request(
        `/api/engagements/devotional/${encodeURIComponent(id)}/remove`,
        "POST",
        headers,
      );
      assert.equal(removed.status, 200, removed.body);
    }
    for (const id of firstBody.defaults.companionIds) {
      const removed = await request(
        `/api/engagements/sermon-companion/${encodeURIComponent(id)}/remove`,
        "POST",
        headers,
      );
      assert.equal(removed.status, 200, removed.body);
    }

    const second = await request("/api/member-home/initialize-defaults", "POST", headers);
    assert.equal(second.status, 200, second.body);
    const secondBody = parse<InitializeResponse>(second.body);

    assert.equal(secondBody.initialized, true);
    assert.equal(secondBody.seeded, false);
    assert.deepEqual(secondBody.defaults, {
      journeyIds: [],
      devotionalSeriesIds: [],
      companionIds: [],
    });
  });
});