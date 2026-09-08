/**
 * Self-service Personal Details API regression coverage.
 *
 * Run:
 *   NODE_ENV=test ALLOW_TEST_AUTH_HARNESS=1 \
 *     node --test --import=tsx/esm src/routes/__tests__/member-profile.test.ts
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { pool } from "@workspace/db";
import { listUnifiedPeople } from "../../lib/pastoral-store.ts";
import { authHeader, cleanupTestAuth, testUserIdFor } from "../../test-utils/test-auth.ts";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const MEMBER_A = `member-profile-a-${Date.now()}`;
const MEMBER_B = `member-profile-b-${Date.now()}`;
const subjects: string[] = [];

async function request(
  path: string,
  method: "GET" | "PUT" = "GET",
  headers: Record<string, string> = {},
  body?: unknown,
): Promise<{ status: number; body: string }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.text() };
}

function parse<T>(body: string): T {
  return JSON.parse(body) as T;
}

after(async () => {
  if (subjects.length > 0) {
    await pool.query(
      "DELETE FROM pastoral_audit_log WHERE changed_by = ANY($1::text[])",
      [subjects],
    );
  }
  await cleanupTestAuth();
});

describe("member personal details", () => {
  it("requires authentication and only accepts the editable whitelist", async () => {
    const unauthenticated = await request("/api/member/profile");
    assert.equal(unauthenticated.status, 401);

    const headers = await authHeader(MEMBER_A);
    subjects.push(await testUserIdFor(MEMBER_A));

    const unknownField = await request(
      "/api/member/profile",
      "PUT",
      headers,
      { preferredName: "Grace", userId: "someone-else" },
    );
    assert.equal(unknownField.status, 400, unknownField.body);
  });

  it("persists a member's own details, keeps birth dates date-only, and redacts audit values", async () => {
    const headersA = await authHeader(MEMBER_A);
    const subjectA = await testUserIdFor(MEMBER_A);
    if (!subjects.includes(subjectA)) subjects.push(subjectA);
    const headersB = await authHeader(MEMBER_B);
    const subjectB = await testUserIdFor(MEMBER_B);
    if (!subjects.includes(subjectB)) subjects.push(subjectB);

    const initial = await request("/api/member/profile", "GET", headersA);
    assert.equal(initial.status, 200, initial.body);
    assert.equal(parse<{ email: string }>(initial.body).email.endsWith("@itest.invalid"), true);

    const updated = await request(
      "/api/member/profile",
      "PUT",
      headersA,
      {
        preferredName: "Grace",
        contactNumber: "+27 82 555 0101",
        physicalAddress: "12 Emmaus Lane\nJohannesburg",
        dateOfBirth: "1985-02-03",
        iccMembership: "yes",
      },
    );
    assert.equal(updated.status, 200, updated.body);
    const profile = parse<{
      preferredName: string;
      contactNumber: string;
      physicalAddress: string;
      dateOfBirth: string;
      iccMembership: string;
    }>(updated.body);
    assert.equal(profile.preferredName, "Grace");
    assert.equal(profile.contactNumber, "+27 82 555 0101");
    assert.equal(profile.physicalAddress, "12 Emmaus Lane\nJohannesburg");
    assert.equal(profile.dateOfBirth, "1985-02-03");
    assert.equal(profile.iccMembership, "yes");

    const registerPerson = (await listUnifiedPeople()).find(
      person => person.linkedUserId === subjectA,
    );
    assert.equal(registerPerson?.phone, "+27 82 555 0101");
    assert.equal(registerPerson?.physicalAddress, "12 Emmaus Lane\nJohannesburg");
    assert.equal(registerPerson?.dateOfBirth, "1985-02-03");
    assert.equal(registerPerson?.iccMembership, "yes");

    const otherProfile = await request("/api/member/profile", "GET", headersB);
    assert.equal(otherProfile.status, 200, otherProfile.body);
    assert.notEqual(parse<{ preferredName: string }>(otherProfile.body).preferredName, "Grace");

    const invalidDate = await request(
      "/api/member/profile",
      "PUT",
      headersA,
      { dateOfBirth: "2000-02-31" },
    );
    assert.equal(invalidDate.status, 400, invalidDate.body);

    const futureDate = await request(
      "/api/member/profile",
      "PUT",
      headersA,
      { dateOfBirth: "2999-01-01" },
    );
    assert.equal(futureDate.status, 400, futureDate.body);

    const invalidPhone = await request(
      "/api/member/profile",
      "PUT",
      headersA,
      { contactNumber: "<script>alert(1)</script>" },
    );
    assert.equal(invalidPhone.status, 400, invalidPhone.body);

    const afterRejectedUpdates = await request("/api/member/profile", "GET", headersA);
    assert.equal(afterRejectedUpdates.status, 200, afterRejectedUpdates.body);
    assert.deepEqual(parse<{
      preferredName: string;
      email: string;
      contactNumber: string;
      physicalAddress: string;
      dateOfBirth: string;
      iccMembership: string;
    }>(afterRejectedUpdates.body), {
      preferredName: "Grace",
      email: parse<{ email: string }>(initial.body).email,
      contactNumber: "+27 82 555 0101",
      physicalAddress: "12 Emmaus Lane\nJohannesburg",
      dateOfBirth: "1985-02-03",
      iccMembership: "yes",
    });

    const audit = await pool.query<{
      previous_value: unknown;
      new_value: unknown;
      action: string;
    }>(
      `SELECT previous_value, new_value, action
         FROM pastoral_audit_log
        WHERE changed_by = $1
          AND entity_type = 'member_profile'
        ORDER BY changed_at DESC`,
      [subjectA],
    );
    assert.equal(audit.rows[0]?.action, "self_service_update");
    const auditText = JSON.stringify(audit.rows[0]);
    assert.equal(auditText.includes("12 Emmaus Lane"), false);
    assert.equal(auditText.includes("+27 82 555 0101"), false);
    assert.equal(auditText.includes("1985-02-03"), false);
    assert.equal(auditText.includes("yes"), false);
    const previousValue = typeof audit.rows[0]?.previous_value === "string"
      ? JSON.parse(audit.rows[0].previous_value)
      : audit.rows[0]?.previous_value;
    assert.deepEqual(previousValue, {
      fields: ["preferredName", "contactNumber", "physicalAddress", "dateOfBirth", "iccMembership"],
    });
  });
});