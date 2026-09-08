import test from "node:test";
import assert from "node:assert/strict";
import type { Request } from "express";
import {
  extractUserId,
  requireAdmin,
  requireAuth,
  requireSuperAdmin,
} from "../auth.ts";

type RecordedResponse = {
  statusCode: number | null;
  body: object | null;
  response: {
    status: (code: number) => { json: (body: object) => void };
  };
};

function recordedResponse(): RecordedResponse {
  const state: RecordedResponse = {
    statusCode: null,
    body: null,
    response: {
      status(code) {
        state.statusCode = code;
        return {
          json(body) {
            state.body = body;
          },
        };
      },
    },
  };
  return state;
}

function request(
  role?: "user" | "admin" | "superAdmin",
  extra: Partial<Request> = {},
): Request {
  return {
    headers: {},
    body: {},
    ...extra,
    ...(role
      ? {
          user: {
            id: `verified-${role}`,
            email: `${role}@example.test`,
            firstName: role,
            lastName: null,
            profileImageUrl: null,
            preferredName: role,
            role,
          },
        }
      : {}),
  } as unknown as Request;
}

test("browser-supplied identity and role headers are never authentication", () => {
  const forged = request(undefined, {
    headers: {
      "x-user-id": "demo-superadmin-1",
      "x-user-role": "superAdmin",
    },
    body: {
      userId: "demo-superadmin-1",
      userRole: "superAdmin",
    },
  } as Partial<Request>);

  assert.equal(extractUserId(forged), null);

  const authResponse = recordedResponse();
  assert.equal(requireAuth(forged, authResponse.response), null);
  assert.equal(authResponse.statusCode, 401);

  const adminResponse = recordedResponse();
  assert.equal(requireAdmin(forged, adminResponse.response), null);
  assert.equal(adminResponse.statusCode, 401);

  const superResponse = recordedResponse();
  assert.equal(requireSuperAdmin(forged, superResponse.response), null);
  assert.equal(superResponse.statusCode, 401);
});

test("ordinary verified users cannot enter admin boundaries", () => {
  const req = request("user");
  const response = recordedResponse();

  assert.equal(requireAdmin(req, response.response), null);
  assert.equal(response.statusCode, 403);
});

test("verified admin and super-admin roles are enforced separately", () => {
  const adminResponse = recordedResponse();
  assert.equal(
    requireAdmin(request("admin"), adminResponse.response),
    "verified-admin",
  );
  assert.equal(adminResponse.statusCode, null);

  const denied = recordedResponse();
  assert.equal(
    requireSuperAdmin(request("admin"), denied.response),
    null,
  );
  assert.equal(denied.statusCode, 403);

  const allowed = recordedResponse();
  assert.equal(
    requireSuperAdmin(request("superAdmin"), allowed.response),
    "verified-superAdmin",
  );
  assert.equal(allowed.statusCode, null);
});