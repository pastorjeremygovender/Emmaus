import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer, type Server } from "node:http";
import { deleteSupabaseUser, SupabaseAuthError } from "../supabase-auth.ts";

if (process.env.NODE_ENV !== "test") {
  throw new Error("supabase-delete-idempotency.test: NODE_ENV must be test");
}

let server: Server;
let previousUrl: string | undefined;

before(async () => {
  previousUrl = process.env.SUPABASE_AUTH_TEST_URL;
  server = createServer((_req, res) => {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "User not found" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.SUPABASE_AUTH_TEST_URL = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (previousUrl === undefined) delete process.env.SUPABASE_AUTH_TEST_URL;
  else process.env.SUPABASE_AUTH_TEST_URL = previousUrl;
});

describe("Supabase permanent-delete retry", () => {
  it("treats a provider 404 as successful only when an authorized retry asks for it", async () => {
    await assert.rejects(
      deleteSupabaseUser("deleted-subject"),
      (error: unknown) => error instanceof SupabaseAuthError && error.status === 404,
    );
    await assert.doesNotReject(
      deleteSupabaseUser("deleted-subject", { ignoreNotFound: true }),
    );
  });
});