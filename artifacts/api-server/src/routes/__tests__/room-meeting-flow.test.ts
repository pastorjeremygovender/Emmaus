/**
 * Two-identity integration coverage for the active Group Meeting contract.
 *
 * This test creates one isolated __TEST__ room and removes it (and its
 * session/message rows) in after(). It must never run against production.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import crypto from "node:crypto";
import http from "node:http";
import { pool } from "@workspace/db";
import {
  createRoom,
  joinByToken,
} from "../../lib/room-store.ts";
import {
  authHeader,
  cleanupTestAuth,
  testUserIdFor,
} from "../../test-utils/test-auth.ts";

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("room-meeting-flow.test: refused to run in production/deployment");
}
if (process.env.ALLOW_TEST_AUTH_HARNESS !== "1" || nodeEnv !== "test") {
  throw new Error(
    "room-meeting-flow.test: set NODE_ENV=test and ALLOW_TEST_AUTH_HARNESS=1",
  );
}

type RequestOptions = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: object;
};

let server: http.Server;
let roomId = "";
let sessionId = "";
let leaderHeaders: { Authorization: string };
let memberHeaders: { Authorization: string };
let preparedMediaId = "";
const nonce = crypto.randomBytes(6).toString("hex");
const leaderKey = `room-meeting-leader-${nonce}`;
const memberKey = `room-meeting-member-${nonce}`;

function request(options: RequestOptions): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const payload = options.body ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };
    if (payload) headers["Content-Length"] = String(Buffer.byteLength(payload));
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: (server.address() as { port: number }).port,
        method: options.method ?? "GET",
        path: options.path,
        headers,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString(),
          headers: res.headers,
        }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function json<T>(response: { body: string }): T {
  return JSON.parse(response.body) as T;
}

async function openChatStream(
  token: string,
  onMessage: (message: { body?: string; clientMessageId?: string }) => void,
): Promise<() => void> {
  const req = http.request({
    hostname: "127.0.0.1",
    port: (server.address() as { port: number }).port,
    path: `/api/rooms/${roomId}/messages/stream?token=${encodeURIComponent(token)}`,
    headers: { Accept: "text/event-stream" },
  });
  let response: http.IncomingMessage | null = null;
  const close = () => {
    response?.destroy();
    req.destroy();
  };
  req.on("error", err => {
    if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") throw err;
  });
  req.on("response", res => {
    response = res;
    let buffer = "";
    res.on("data", chunk => {
      buffer += Buffer.from(chunk).toString();
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const line = event.split("\n").find(value => value.startsWith("data: "));
        if (line) {
          const message = JSON.parse(line.slice(6)) as {
            body?: string;
            clientMessageId?: string;
          };
          if (message.body) onMessage(message);
        }
      }
    });
  });
  req.end();
  // Give the server one event-loop turn to register the subscriber.
  await new Promise(resolve => setTimeout(resolve, 30));
  return close;
}

async function openSessionStream(
  token: string,
  onEvent: (event: { type?: string; payload?: Record<string, unknown> }) => void,
): Promise<() => void> {
  const req = http.request({
    hostname: "127.0.0.1",
    port: (server.address() as { port: number }).port,
    path: `/api/rooms/${roomId}/session/events?token=${encodeURIComponent(token)}`,
    headers: { Accept: "text/event-stream" },
  });
  let response: http.IncomingMessage | null = null;
  const close = () => {
    response?.destroy();
    req.destroy();
  };
  req.on("error", err => {
    if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") throw err;
  });
  req.on("response", res => {
    response = res;
    let buffer = "";
    res.on("data", chunk => {
      buffer += Buffer.from(chunk).toString();
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const line = event.split("\n").find(value => value.startsWith("data: "));
        if (line) onEvent(JSON.parse(line.slice(6)) as { type?: string; payload?: Record<string, unknown> });
      }
    });
  });
  req.end();
  await new Promise(resolve => setTimeout(resolve, 30));
  return close;
}

before(async () => {
  const [
    { default: express },
    { authMiddleware },
    { default: roomsRouter },
  ] = await Promise.all([
    import("express"),
    import("../../middlewares/authMiddleware.ts"),
    import("../rooms.ts"),
  ]);
  const app = express();
  app.use(express.json());
  // Match the logger surface normally installed by pino-http. The auth
  // middleware only needs these methods for its diagnostic paths.
  app.use((_req, _res, next) => {
    (_req as unknown as Record<string, unknown>).log = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    next();
  });
  app.use(authMiddleware);
  app.use("/api/rooms", roomsRouter);
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));

  const leaderId = await testUserIdFor(leaderKey);
  const memberId = await testUserIdFor(memberKey);
  leaderHeaders = await authHeader(leaderKey);
  memberHeaders = await authHeader(memberKey);

  const room = await createRoom(`__TEST__ Meeting ${nonce}`, leaderId, "", "friends");
  roomId = String(room.roomId);
  await joinByToken(room.inviteToken, memberId);
});

after(async () => {
  if (server) {
    // The SSE test deliberately keeps one response open. Force it closed
    // before waiting for the temporary HTTP server to drain.
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
  if (roomId) {
    await pool.query("DELETE FROM room_session_attendance WHERE room_id = $1", [roomId]);
    await pool.query("DELETE FROM room_messages WHERE room_id = $1", [roomId]);
    await pool.query("DELETE FROM room_sessions WHERE room_id = $1", [roomId]);
    await pool.query("DELETE FROM room_members WHERE room_id = $1", [roomId]);
    await pool.query("DELETE FROM rooms WHERE id = $1", [roomId]);
  }
  await cleanupTestAuth();
});

describe("two-device active Group Meeting flow", () => {
  it("keeps prepared media private until its leader shares it", async () => {
    const prepared = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/media`,
      headers: leaderHeaders,
      body: {
        attachment: {
          type: "link",
          filename: "Preparation guide",
          objectPath: "",
          mimeType: "text/uri-list",
          size: 0,
          url: "https://example.com/preparation",
        },
      },
    });
    assert.equal(prepared.status, 201, prepared.body);

    const [leaderPrivate, memberPrivate] = await Promise.all([
      request({ path: `/api/rooms/${roomId}/media`, headers: leaderHeaders }),
      request({ path: `/api/rooms/${roomId}/media`, headers: memberHeaders }),
    ]);
    const leaderItems = json<{ media: Array<{ messageId: string; attachment: { sharedBeforeMeeting?: boolean } }> }>(leaderPrivate).media;
    preparedMediaId = leaderItems.find(item => item.attachment.sharedBeforeMeeting === false)?.messageId ?? "";
    assert.ok(preparedMediaId);
    assert.equal(
      json<{ media: Array<{ messageId: string }> }>(memberPrivate).media
        .some(item => item.messageId === preparedMediaId),
      false,
    );

    const shared = await request({
      method: "PATCH",
      path: `/api/rooms/${roomId}/media/${preparedMediaId}/visibility`,
      headers: leaderHeaders,
      body: { shared: true },
    });
    assert.equal(shared.status, 200, shared.body);
    const memberShared = await request({
      path: `/api/rooms/${roomId}/media`,
      headers: memberHeaders,
    });
    assert.equal(
      json<{ media: Array<{ messageId: string }> }>(memberShared).media
        .some(item => item.messageId === preparedMediaId),
      true,
    );

    const forbidden = await request({
      method: "PATCH",
      path: `/api/rooms/${roomId}/media/visibility`,
      headers: memberHeaders,
      body: { shared: false },
    });
    assert.equal(forbidden.status, 403, forbidden.body);

    const hidden = await request({
      method: "PATCH",
      path: `/api/rooms/${roomId}/media/visibility`,
      headers: leaderHeaders,
      body: { shared: false },
    });
    assert.equal(hidden.status, 200, hidden.body);
    const memberHidden = await request({
      path: `/api/rooms/${roomId}/media`,
      headers: memberHeaders,
    });
    assert.equal(json<{ media: unknown[] }>(memberHidden).media.length, 0);
  });

  it("keeps pre-join state identical and does not authorize discussion early", async () => {
    const roomDetail = await request({
      path: `/api/rooms/${roomId}`,
      headers: leaderHeaders,
    });
    assert.equal(roomDetail.status, 200, roomDetail.body);
    assert.match(
      String(roomDetail.headers["cache-control"] ?? ""),
      /no-store/,
    );

    const started = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/start`,
      headers: leaderHeaders,
    });
    assert.equal(started.status, 201, started.body);
    sessionId = json<{ session: { id: string } }>(started).session.id;

    const [leaderAttendance, memberAttendance, memberChat] = await Promise.all([
      request({
        path: `/api/rooms/${roomId}/session/attendance?sessionId=${sessionId}`,
        headers: leaderHeaders,
      }),
      request({
        path: `/api/rooms/${roomId}/session/attendance?sessionId=${sessionId}`,
        headers: memberHeaders,
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/messages/stream/token`,
        headers: memberHeaders,
      }),
    ]);

    assert.equal(leaderAttendance.status, 200);
    assert.equal(memberAttendance.status, 200);
    assert.equal(
      json<{ attendance: Array<{ userId: string }> }>(leaderAttendance).attendance.length,
      1,
    );
    assert.deepEqual(
      json<{ attendance: Array<{ userId: string }> }>(leaderAttendance).attendance,
      json<{ attendance: Array<{ userId: string }> }>(memberAttendance).attendance,
    );
    assert.equal(memberChat.status, 403);
  });

  it("returns saved attendance, unlocks the same discussion, and delivers realtime history", async () => {
    const memberId = await testUserIdFor(memberKey);
    const joined = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/attendance/join`,
      headers: memberHeaders,
      body: { sessionId },
    });
    assert.equal(joined.status, 200, joined.body);
    assert.equal(json<{ attendance: { userId: string } }>(joined).attendance.userId, memberId);

    const [leaderAttendance, memberAttendance, chatToken] = await Promise.all([
      request({
        path: `/api/rooms/${roomId}/session/attendance?sessionId=${sessionId}`,
        headers: leaderHeaders,
      }),
      request({
        path: `/api/rooms/${roomId}/session/attendance?sessionId=${sessionId}`,
        headers: memberHeaders,
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/messages/stream/token`,
        headers: memberHeaders,
      }),
    ]);
    assert.equal(leaderAttendance.status, 200);
    assert.deepEqual(
      json<{ attendance: unknown }>(leaderAttendance).attendance,
      json<{ attendance: unknown }>(memberAttendance).attendance,
    );
    assert.equal(
      (json<{ attendance: Array<{ userId: string }> }>(memberAttendance).attendance)
        .some(row => row.userId === memberId),
      true,
    );
    assert.equal(chatToken.status, 200, chatToken.body);

    const token = json<{ token: string }>(chatToken).token;
    let received = "";
    let receivedClientMessageId = "";
    let leaderMessageId = "";
    const closeStream = await openChatStream(token, message => {
      received = message.body ?? "";
      receivedClientMessageId = message.clientMessageId ?? "";
    });
    try {
      const clientMessageId = "room-meeting-flow-client-message";
      const sent = await request({
        method: "POST",
        path: `/api/rooms/${roomId}/messages`,
        headers: leaderHeaders,
        body: { body: "A realtime test message", clientMessageId },
      });
      assert.equal(sent.status, 201, sent.body);
      const sentMessage = json<{
        message: { id: string; clientMessageId?: string };
      }>(sent).message;
      leaderMessageId = sentMessage.id;
      assert.equal(sentMessage.clientMessageId, clientMessageId);
      await new Promise<void>((resolve, reject) => {
        const startedAt = Date.now();
        const poll = () => {
          if (
            received === "A realtime test message" &&
            receivedClientMessageId === clientMessageId
          ) {
            return resolve();
          }
          if (Date.now() - startedAt > 2_000) {
            return reject(new Error(`Timed out waiting for SSE message; received=${received}`));
          }
          setTimeout(poll, 20);
        };
        poll();
      });
    } finally {
      closeStream();
    }

      const memberSent = await request({
        method: "POST",
        path: `/api/rooms/${roomId}/messages`,
        headers: memberHeaders,
        body: { body: "A member-owned post" },
      });
      assert.equal(memberSent.status, 201, memberSent.body);
      const memberMessageId = json<{ message: { id: string } }>(memberSent).message.id;

      const memberDeletingLeaderPost = await request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/messages/${leaderMessageId}`,
        headers: memberHeaders,
      });
      assert.equal(memberDeletingLeaderPost.status, 403, memberDeletingLeaderPost.body);

      const memberDeletingOwnPost = await request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/messages/${memberMessageId}`,
        headers: memberHeaders,
      });
      assert.equal(memberDeletingOwnPost.status, 200, memberDeletingOwnPost.body);

      const secondMemberPost = await request({
        method: "POST",
        path: `/api/rooms/${roomId}/messages`,
        headers: memberHeaders,
        body: { body: "A post for the leader to moderate" },
      });
      assert.equal(secondMemberPost.status, 201, secondMemberPost.body);
      const moderatedMessageId = json<{ message: { id: string } }>(secondMemberPost).message.id;

      const leaderDeletingMemberPost = await request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/messages/${moderatedMessageId}`,
        headers: leaderHeaders,
      });
      assert.equal(leaderDeletingMemberPost.status, 200, leaderDeletingMemberPost.body);

      const leaderDeletingOwnPost = await request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/messages/${leaderMessageId}`,
        headers: leaderHeaders,
      });
      assert.equal(leaderDeletingOwnPost.status, 200, leaderDeletingOwnPost.body);

    const history = await request({
      path: `/api/rooms/${roomId}/messages`,
      headers: memberHeaders,
    });
    assert.equal(history.status, 200, history.body);
    assert.equal(
      json<{ messages: Array<{ body: string }> }>(history).messages
        .some(message => message.body === "A realtime test message"),
      false,
    );
  });

  it("broadcasts Discussion close and keeps it closed in reconnect hydration", async () => {
    const tokenResponse = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/events/token`,
      headers: memberHeaders,
    });
    assert.equal(tokenResponse.status, 200, tokenResponse.body);
    const token = json<{ token: string }>(tokenResponse).token;
    const events: Array<{ type?: string; payload?: Record<string, unknown> }> = [];
    const closeStream = await openSessionStream(token, event => events.push(event));
    const waitFor = async (type: string) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 2_000) {
        if (events.some(event => event.type === type)) return;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      throw new Error(`Timed out waiting for ${type}`);
    };

    try {
      const mode = await request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/mode`,
        headers: leaderHeaders,
        body: { mode: "discussion" },
      });
      assert.equal(mode.status, 200, mode.body);
      await waitFor("mode_change");

      const closed = await request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/tool-close`,
        headers: leaderHeaders,
        body: { tool: "discussion" },
      });
      assert.equal(closed.status, 200, closed.body);
      await waitFor("tool_closed");

      const detail = await request({
        path: `/api/rooms/${roomId}`,
        headers: memberHeaders,
      });
      assert.equal(detail.status, 200, detail.body);
      assert.equal(
        json<{ activeSession: { metadata?: { activeTool?: string } } }>(detail)
          .activeSession.metadata?.activeTool,
        undefined,
      );
    } finally {
      closeStream();
    }

    const lateTokenResponse = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/events/token`,
      headers: memberHeaders,
    });
    assert.equal(lateTokenResponse.status, 200, lateTokenResponse.body);
    const lateEvents: Array<{ type?: string; payload?: Record<string, unknown> }> = [];
    const closeLateStream = await openSessionStream(
      json<{ token: string }>(lateTokenResponse).token,
      event => lateEvents.push(event),
    );
    try {
      await new Promise(resolve => setTimeout(resolve, 80));
      const state = lateEvents.find(event => event.type === "session_state");
      assert.equal(
        (state?.payload?.session as { metadata?: { activeTool?: string } } | null)
          ?.metadata?.activeTool,
        undefined,
      );
    } finally {
      closeLateStream();
    }
  });
});