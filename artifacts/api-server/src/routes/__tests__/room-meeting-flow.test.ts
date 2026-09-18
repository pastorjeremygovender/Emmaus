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
let adminHeaders: { Authorization: string };
let leaderId = "";
let adminId = "";
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

  leaderId = await testUserIdFor(leaderKey);
  const memberId = await testUserIdFor(memberKey);
  adminId = await testUserIdFor(`room-meeting-admin-${nonce}`, "admin");
  adminHeaders = await authHeader(`room-meeting-admin-${nonce}`, { role: "admin" });
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
    const mediaHostAccess = json<{
      mediaHostAccess: { audio: boolean; video: boolean };
    }>(roomDetail).mediaHostAccess;
    assert.deepEqual(
      { audio: mediaHostAccess.audio, video: mediaHostAccess.video },
      { audio: false, video: false },
    );
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

    const [audioStart, videoStart] = await Promise.all([
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/start`,
        headers: leaderHeaders,
        body: { meetingMode: "audio" },
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/start`,
        headers: leaderHeaders,
        body: { meetingMode: "video" },
      }),
    ]);
    assert.equal(audioStart.status, 403, audioStart.body);
    assert.match(audioStart.body, /Audio meetings have not been enabled/);
    assert.equal(videoStart.status, 403, videoStart.body);
    assert.match(videoStart.body, /Video meetings have not been enabled/);

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

  it("lets an administrator change each media permission independently and records the change", async () => {
    const nonAdminRead = await request({
      path: `/api/rooms/admin/persons/${encodeURIComponent(leaderId)}/media-access`,
      headers: leaderHeaders,
    });
    assert.equal(nonAdminRead.status, 403, nonAdminRead.body);

    const enabled = await request({
      method: "PATCH",
      path: `/api/rooms/admin/persons/${encodeURIComponent(leaderId)}/media-access`,
      headers: adminHeaders,
      body: { audio: true },
    });
    assert.equal(enabled.status, 200, enabled.body);
    const enabledAccess = json<{ audio: boolean; video: boolean }>(enabled);
    assert.equal(enabledAccess.audio, true);
    assert.equal(enabledAccess.video, false);

    const audit = await pool.query<{
      previous_state: { permission?: string; previousValue?: boolean } | null;
      new_state: { permission?: string; newValue?: boolean } | null;
    }>(
      `SELECT previous_state, new_state
         FROM content_audit_log
        WHERE content_type = 'user_permission'
          AND content_id = $1
          AND performed_by = $2
        ORDER BY performed_at DESC
        LIMIT 1`,
      [leaderId, adminId],
    );
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0]?.previous_state?.permission, "audio_meetings");
    assert.equal(audit.rows[0]?.previous_state?.previousValue, false);
    assert.equal(audit.rows[0]?.new_state?.newValue, true);

    const restored = await request({
      method: "PATCH",
      path: `/api/rooms/admin/persons/${encodeURIComponent(leaderId)}/media-access`,
      headers: adminHeaders,
      body: { audio: false, video: true },
    });
    assert.equal(restored.status, 200, restored.body);
    const restoredAccess = json<{ audio: boolean; video: boolean }>(restored);
    assert.equal(restoredAccess.audio, false);
    assert.equal(restoredAccess.video, true);
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
        body: { sessionId, mode: "discussion" },
      });
      assert.equal(mode.status, 200, mode.body);
      await waitFor("mode_change");

      const closed = await request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/tool-close`,
        headers: leaderHeaders,
        body: { sessionId, tool: "discussion" },
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

  it("serializes competing presentation starts so durable panel data matches the winning row", async () => {
    const starts = await Promise.all([
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: { filename: "race-a.pdf", mediaType: "pdf", objectPath: "" },
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: { filename: "race-b.pdf", mediaType: "pdf", objectPath: "" },
      }),
    ]);
    for (const response of starts) assert.equal(response.status, 200, response.body);

    const [presentationResponse, sessionResponse] = await Promise.all([
      request({ path: `/api/rooms/${roomId}/session/presentation`, headers: memberHeaders }),
      request({ path: `/api/rooms/${roomId}/session`, headers: memberHeaders }),
    ]);
    assert.equal(presentationResponse.status, 200, presentationResponse.body);
    assert.equal(sessionResponse.status, 200, sessionResponse.body);
    const presentation = json<{
      presentation: { id: string; messageId: string | null; currentPage: number };
    }>(presentationResponse).presentation;
    const panel = json<{
      sharedPanel: {
        panel: string; version: number;
        data?: { presentationId?: string; messageId?: string | null; currentPage?: number };
      };
    }>(sessionResponse).sharedPanel;
    assert.ok(presentation);
    assert.equal(panel.panel, "presentation");
    assert.ok(Number.isInteger(panel.version) && panel.version > 0);
    assert.equal(panel.data?.presentationId, presentation.id);
    assert.equal(panel.data?.messageId, presentation.messageId);
    assert.equal(panel.data?.currentPage, presentation.currentPage);
  });

  it("does not deadlock concurrent presentation start, stop, and media removal", async () => {
    const assertCoherent = async () => {
      const [presentationResponse, sessionResponse] = await Promise.all([
        request({ path: `/api/rooms/${roomId}/session/presentation`, headers: leaderHeaders }),
        request({ path: `/api/rooms/${roomId}/session`, headers: leaderHeaders }),
      ]);
      assert.equal(presentationResponse.status, 200, presentationResponse.body);
      assert.equal(sessionResponse.status, 200, sessionResponse.body);
      const presentation = json<{ presentation: { id: string } | null }>(presentationResponse).presentation;
      const panel = json<{ sharedPanel: { panel: string; data?: { presentationId?: string } } }>(
        sessionResponse,
      ).sharedPanel;
      if (presentation) {
        assert.equal(panel.panel, "presentation");
        assert.equal(panel.data?.presentationId, presentation.id);
      } else {
        assert.notEqual(panel.panel, "presentation");
      }
    };

    const [started, stopped] = await Promise.all([
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: { filename: "start-stop.pdf", mediaType: "pdf", objectPath: "" },
      }),
      request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: { sessionId, presentationId: "not-yet-started" },
      }),
    ]);
    assert.notEqual(started.status, 500, started.body);
    assert.notEqual(stopped.status, 500, stopped.body);
    await assertCoherent();

    const prepared = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/media`,
      headers: leaderHeaders,
      body: {
        attachment: {
          type: "link", filename: "race-removal-link", objectPath: "",
          mimeType: "text/uri-list", size: 0, url: "https://example.com/race",
        },
      },
    });
    assert.equal(prepared.status, 201, prepared.body);
    const media = await request({ path: `/api/rooms/${roomId}/media`, headers: leaderHeaders });
    const messageId = json<{ media: Array<{ messageId: string; attachment: { filename: string } }> }>(media)
      .media.find(item => item.attachment.filename === "race-removal-link")?.messageId;
    assert.ok(messageId);

    const [startWithMedia, removed] = await Promise.all([
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: {
          messageId, filename: "race-removal-link", mediaType: "link", objectPath: "",
        },
      }),
      request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/media/${messageId}`,
        headers: leaderHeaders,
      }),
    ]);
    assert.notEqual(startWithMedia.status, 500, startWithMedia.body);
    assert.notEqual(removed.status, 500, removed.body);
    await assertCoherent();
    const afterRemove = await request({
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
    });
    assert.notEqual(
      json<{ presentation: { messageId: string | null } | null }>(afterRemove).presentation?.messageId,
      messageId,
    );

    const sourceMessage = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/messages`,
      headers: leaderHeaders,
      body: {
        attachment: {
          type: "link", filename: "race-delete-link", objectPath: "",
          mimeType: "text/uri-list", size: 0, url: "https://example.com/delete-race",
        },
      },
    });
    assert.equal(sourceMessage.status, 201, sourceMessage.body);
    const sourceMessageId = json<{ message: { id: string } }>(sourceMessage).message.id;
    const [startBeforeDelete, deleted] = await Promise.all([
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: {
          messageId: sourceMessageId,
          filename: "race-delete-link",
          mediaType: "link",
          objectPath: "",
        },
      }),
      request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/messages/${sourceMessageId}`,
        headers: leaderHeaders,
      }),
    ]);
    assert.notEqual(startBeforeDelete.status, 500, startBeforeDelete.body);
    assert.notEqual(deleted.status, 500, deleted.body);
    await assertCoherent();
    const afterDelete = await request({
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
    });
    assert.notEqual(
      json<{ presentation: { messageId: string | null } | null }>(afterDelete).presentation?.messageId,
      sourceMessageId,
    );

    const initial = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
      body: { filename: "old-pages.pdf", mediaType: "pdf", objectPath: "" },
    });
    assert.equal(initial.status, 200, initial.body);
    const initialId = json<{ presentation: { id: string } }>(initial).presentation.id;
    const [pageDuringStart, replacement] = await Promise.all([
      request({
        method: "PATCH",
        path: `/api/rooms/${roomId}/session/presentation/page`,
        headers: leaderHeaders,
        body: { presentationId: initialId, page: 2 },
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: { filename: "new-pages.pdf", mediaType: "pdf", objectPath: "" },
      }),
    ]);
    assert.notEqual(pageDuringStart.status, 500, pageDuringStart.body);
    assert.notEqual(replacement.status, 500, replacement.body);
    await assertCoherent();

    const current = await request({
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
    });
    const currentId = json<{ presentation: { id: string } }>(current).presentation.id;
    const [pageDuringStop, stopDuringPage] = await Promise.all([
      request({
        method: "PATCH",
        path: `/api/rooms/${roomId}/session/presentation/page`,
        headers: leaderHeaders,
        body: { presentationId: currentId, page: 3 },
      }),
      request({
        method: "DELETE",
        path: `/api/rooms/${roomId}/session/presentation`,
        headers: leaderHeaders,
        body: { sessionId, presentationId: currentId },
      }),
    ]);
    assert.notEqual(pageDuringStop.status, 500, pageDuringStop.body);
    assert.notEqual(stopDuringPage.status, 500, stopDuringPage.body);
    await assertCoherent();
  });

  it("rejects delayed presentation mutations from a replaced meeting session", async () => {
    const oldSessionId = sessionId;
    const ended = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/end`,
      headers: leaderHeaders,
      body: { status: "ended" },
    });
    assert.equal(ended.status, 200, ended.body);
    const restarted = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/start`,
      headers: leaderHeaders,
    });
    assert.equal(restarted.status, 201, restarted.body);
    sessionId = json<{ session: { id: string } }>(restarted).session.id;
    assert.notEqual(sessionId, oldSessionId);

    const staleStart = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
      body: {
        sessionId: oldSessionId,
        filename: "stale-session.pdf",
        mediaType: "pdf",
        objectPath: "",
      },
    });
    assert.equal(staleStart.status, 409, staleStart.body);
    let presentationResponse = await request({
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
    });
    assert.equal(json<{ presentation: unknown }>(presentationResponse).presentation, null);

    const currentStart = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
      body: {
        sessionId,
        filename: "current-session.pdf",
        mediaType: "pdf",
        objectPath: "",
      },
    });
    assert.equal(currentStart.status, 200, currentStart.body);
    const currentPresentation = json<{ presentation: { id: string } }>(currentStart).presentation;

    const stalePage = await request({
      method: "PATCH",
      path: `/api/rooms/${roomId}/session/presentation/page`,
      headers: leaderHeaders,
      body: {
        sessionId: oldSessionId,
        presentationId: currentPresentation.id,
        page: 9,
      },
    });
    assert.equal(stalePage.status, 409, stalePage.body);
    const replacementStart = await request({
      method: "POST",
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
      body: {
        sessionId,
        filename: "replacement-session.pdf",
        mediaType: "pdf",
        objectPath: "",
      },
    });
    assert.equal(replacementStart.status, 200, replacementStart.body);
    const replacementPresentation = json<{ presentation: { id: string } }>(replacementStart).presentation;

    const staleStop = await request({
      method: "DELETE",
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
      body: { sessionId, presentationId: currentPresentation.id },
    });
    assert.equal(staleStop.status, 409, staleStop.body);

    presentationResponse = await request({
      path: `/api/rooms/${roomId}/session/presentation`,
      headers: leaderHeaders,
    });
    const surviving = json<{ presentation: { id: string; currentPage: number } }>(
      presentationResponse,
    ).presentation;
    assert.equal(surviving.id, replacementPresentation.id);
    assert.equal(surviving.currentPage, 1);
    const lateHydration = json<{
      sessionId: string | null;
      presentation: { id: string; sessionId: string | null };
      sharedPanel: { panel: string; version: number; data?: { presentationId?: string } };
    }>(presentationResponse);
    assert.equal(lateHydration.sessionId, sessionId);
    assert.equal(lateHydration.presentation.sessionId, sessionId);
    assert.equal(lateHydration.sharedPanel.panel, "presentation");
    assert.ok(lateHydration.sharedPanel.version > 0);
    assert.equal(lateHydration.sharedPanel.data?.presentationId, replacementPresentation.id);

    const paged = await request({
      method: "PATCH",
      path: `/api/rooms/${roomId}/session/presentation/page`,
      headers: leaderHeaders,
      body: { sessionId, presentationId: replacementPresentation.id, page: 2 },
    });
    assert.equal(paged.status, 200, paged.body);
    const pagedState = json<{
      sessionId: string;
      presentation: { id: string; currentPage: number; filename: string; mediaType: string; objectPath: string };
      sharedPanel: { version: number; data?: { presentationId?: string; currentPage?: number } };
    }>(paged);
    assert.equal(pagedState.sessionId, sessionId);
    assert.equal(pagedState.presentation.id, replacementPresentation.id);
    assert.equal(pagedState.presentation.currentPage, 2);
    assert.equal(pagedState.presentation.filename, "replacement-session.pdf");
    assert.equal(pagedState.presentation.mediaType, "pdf");
    assert.equal(pagedState.presentation.objectPath, "");
    assert.equal(pagedState.sharedPanel.data?.presentationId, replacementPresentation.id);
    assert.equal(pagedState.sharedPanel.data?.currentPage, 2);
    const sessionResponse = await request({
      path: `/api/rooms/${roomId}/session`,
      headers: leaderHeaders,
    });
    const panel = json<{
      sharedPanel: { panel: string; data?: { presentationId?: string; currentPage?: number } };
    }>(sessionResponse).sharedPanel;
    assert.equal(panel.panel, "presentation");
    assert.equal(panel.data?.presentationId, surviving.id);
    assert.equal(panel.data?.currentPage, 2);

    const delayedCommands = await Promise.all([
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/mode`,
        headers: leaderHeaders,
        body: { sessionId: oldSessionId, mode: "discussion" },
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/navigate`,
        headers: leaderHeaders,
        body: { sessionId: oldSessionId, stepId: "stale-step" },
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/tool-close`,
        headers: leaderHeaders,
        body: { sessionId: oldSessionId, tool: "presentation" },
      }),
      request({
        method: "POST",
        path: `/api/rooms/${roomId}/session/poll`,
        headers: leaderHeaders,
        body: { sessionId: oldSessionId, question: "Stale poll?" },
      }),
      request({
        method: "PUT",
        path: `/api/rooms/${roomId}/session/panel`,
        headers: leaderHeaders,
        body: { sessionId: oldSessionId, panel: "notes", expectedVersion: 0 },
      }),
    ]);
    for (const response of delayedCommands) assert.equal(response.status, 409, response.body);

    const unchangedSession = await request({
      path: `/api/rooms/${roomId}/session`,
      headers: leaderHeaders,
    });
    const unchanged = json<{
      session: { id: string; currentStep: string | null };
      sharedPanel: { panel: string; data?: { presentationId?: string; currentPage?: number } };
    }>(unchangedSession);
    assert.equal(unchanged.session.id, sessionId);
    assert.notEqual(unchanged.session.currentStep, "stale-step");
    assert.equal(unchanged.sharedPanel.panel, "presentation");
    assert.equal(unchanged.sharedPanel.data?.presentationId, surviving.id);
    assert.equal(unchanged.sharedPanel.data?.currentPage, 2);
  });
});