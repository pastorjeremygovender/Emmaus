import test from "node:test";
import assert from "node:assert/strict";
import { getLiveKitConfigurationStatus } from "../livekit.ts";

test("LiveKit configuration reports missing secret names without credential values", () => {
  for (const name of ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"]) {
    process.env[name] = "";
  }

  const status = getLiveKitConfigurationStatus();

  assert.deepEqual(status, {
    configured: false,
    missingSecrets: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
  });
  assert.equal("apiKey" in status, false);
  assert.equal("apiSecret" in status, false);
});