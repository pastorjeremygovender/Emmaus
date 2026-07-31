import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { apiGetMessages, apiGetStreamToken, apiSendMessage } from '@/lib/rooms-api';
import { getApiUrl } from '@/lib/api';
import { ArrowLeft, Send } from 'lucide-react';
import type { RoomMessage } from '@/lib/rooms-types';

const MAX_RECONNECT_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 1_000;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    if (isToday) return 'Today';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function groupByDate(messages: RoomMessage[]): { date: string; items: RoomMessage[] }[] {
  const groups: { date: string; items: RoomMessage[] }[] = [];
  let current: { date: string; items: RoomMessage[] } | null = null;

  // Messages come newest-first from state; reverse for display (oldest → newest)
  const sorted = [...messages].reverse();

  for (const msg of sorted) {
    const date = formatDate(msg.createdAt);
    if (!current || current.date !== date) {
      current = { date, items: [] };
      groups.push(current);
    }
    current.items.push(msg);
  }
  return groups;
}

/**
 * Merge two newest-first message lists, deduplicating by id.
 * Real server messages take priority over optimistic placeholders.
 */
function mergeMessages(a: RoomMessage[], b: RoomMessage[]): RoomMessage[] {
  const seen = new Map<string, RoomMessage>();
  for (const msg of [...a, ...b]) {
    const existing = seen.get(msg.id);
    if (!existing || existing.id.startsWith('opt-')) {
      seen.set(msg.id, msg);
    }
  }
  return Array.from(seen.values()).sort(
    (x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime()
  );
}

export default function RoomChat() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [roomName, setRoomName] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);

  // Load room name from history state
  useEffect(() => {
    const state = history.state as { roomName?: string } | null;
    if (state?.roomName) setRoomName(state.roomName);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // SSE connection with manual reconnect
  //
  // Authentication: EventSource cannot send custom request headers (e.g. X-User-Id),
  // so we use a two-step handshake:
  //   1. POST .../stream/token  — authenticated via requireAuth (cookie or header);
  //      returns a 30 s one-time UUID.
  //   2. GET  .../stream?token=<uuid>  — server re-validates membership after consuming
  //      the token, then opens the SSE stream.
  //
  // Race-free load sequence (per connection):
  //   Each connect() call owns its own `connectionHistoryLoaded` flag and
  //   `connectionBuffer` array so reconnections never share stale state.
  //   A. Open EventSource.  Buffer any SSE events (connectionBuffer).
  //   B. On onopen, fetch history — stream is already open, so no gap exists.
  //   C. Merge history + connectionBuffer, deduplicate by id.  Set loaded = true.
  //   D. Subsequent SSE events for this connection flow directly into state and
  //      are merged with current state (never replace it wholesale).
  //
  // Reconnect (onerror or history-fetch failure):
  //   Close the stale EventSource (prevents its built-in retry using the
  //   consumed token), schedule a new connect() with capped exponential backoff.
  //   History is re-fetched on every reconnect to fill any gap.
  //   Token-fetch failures use the same backoff path.
  useEffect(() => {
    if (!user || !roomId) return;

    let cancelled = false;
    let currentEs: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function scheduleReconnect() {
      if (cancelled || attempt >= MAX_RECONNECT_ATTEMPTS) return;
      const backoffMs = BASE_BACKOFF_MS * Math.pow(2, attempt);
      attempt++;
      reconnectTimer = setTimeout(() => { if (!cancelled) connect(); }, backoffMs);
    }

    function closeCurrentEs() {
      currentEs?.close();
      currentEs = null;
    }

    async function connect() {
      if (cancelled) return;

      // ── Step 1: get a fresh one-time stream token ──────────────────────
      // Failure uses the same capped backoff so transient errors self-heal.
      let token: string;
      try {
        token = await apiGetStreamToken(user!.id, String(roomId));
      } catch (err) {
        if (!cancelled) {
          if (attempt === 1) {
            // First attempt failed — show an error to the user
            setLoadError(err instanceof Error ? err.message : 'Failed to connect to chat.');
          }
          scheduleReconnect();
        }
        return;
      }
      if (cancelled) return;

      // ── Step 2: open EventSource — do NOT rely on its built-in retry ──
      // Per-connection state: each connect() call has its own buffer and
      // loaded flag so reconnections start completely clean.
      let connectionHistoryLoaded = false;
      const connectionBuffer: RoomMessage[] = [];

      const url = getApiUrl(
        `/api/rooms/${String(roomId)}/messages/stream?token=${encodeURIComponent(token)}`
      );
      const es = new EventSource(url);
      currentEs = es;

      es.onmessage = (event: MessageEvent) => {
        if (cancelled || es !== currentEs) return;
        try {
          const msg = JSON.parse(event.data as string) as RoomMessage;

          if (!connectionHistoryLoaded) {
            // ── Phase A: buffer until this connection's history is merged ──
            if (!connectionBuffer.some(m => m.id === msg.id)) {
              connectionBuffer.unshift(msg);
            }
            return;
          }

          // ── Phase D: history loaded — merge directly into current state ──
          setMessages(prev => {
            // Replace a matching optimistic placeholder (same userId + body)
            const optIdx = prev.findIndex(
              m => m.id.startsWith('opt-') && m.userId === msg.userId && m.body === msg.body
            );
            if (optIdx !== -1) {
              const next = [...prev];
              next[optIdx] = msg;
              return next;
            }
            if (prev.some(m => m.id === msg.id)) return prev;
            return [msg, ...prev];
          });
          scrollToBottom();
        } catch {
          // Malformed SSE event — ignore
        }
      };

      // ── Step 3: fetch history now that the stream is open (Phase B) ───
      es.onopen = async () => {
        if (cancelled || es !== currentEs) return;
        attempt = 0; // successful connection — reset backoff counter

        try {
          const msgs = await apiGetMessages(user!.id, String(roomId));
          if (cancelled || es !== currentEs) return;

          // ── Phase C: merge history + buffer, deduplicate ──────────────
          // Use mergeMessages against current state too so pre-existing
          // optimistic messages are preserved rather than wiped.
          setMessages(prev => mergeMessages(mergeMessages(msgs, connectionBuffer), prev));
          connectionBuffer.length = 0;
          connectionHistoryLoaded = true;
          setLoadError('');
          scrollToBottom();
        } catch (err) {
          if (cancelled || es !== currentEs) return;
          // History fetch failed — close this connection and retry.
          // The buffer is local to this connection so a new connect()
          // starts with a fresh empty buffer and loaded = false.
          closeCurrentEs();
          if (attempt === 0) {
            setLoadError(err instanceof Error ? err.message : 'Failed to load messages.');
          }
          scheduleReconnect();
        }
      };

      // Manual reconnect on error — close stale ES immediately so EventSource
      // cannot fire its own retry (which would reuse the consumed token).
      es.onerror = () => {
        if (cancelled || es !== currentEs) return;
        closeCurrentEs();

        // Re-fetch history to fill any gap that occurred while disconnected.
        // Merge with current state so live messages sent during the gap are
        // not lost if they already arrived in state via a previous SSE event.
        if (connectionHistoryLoaded) {
          apiGetMessages(user!.id, String(roomId))
            .then(msgs => {
              if (!cancelled) setMessages(prev => mergeMessages(msgs, prev));
            })
            .catch(() => { /* best-effort gap fill */ });
        }

        scheduleReconnect();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      closeCurrentEs();
    };
  }, [user, roomId, scrollToBottom]);

  const handleSend = async () => {
    if (!body.trim() || !user || !roomId || sending) return;
    const text = body.trim();
    setBody('');
    setSending(true);

    // Optimistic message — SSE will replace it with the canonical version
    const optimistic: RoomMessage = {
      id: `opt-${Date.now()}`,
      roomId: String(roomId),
      userId: user.id,
      senderName: user.preferredName || 'You',
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [optimistic, ...prev]);
    scrollToBottom();

    try {
      await apiSendMessage(user.id, String(roomId), text);
      // SSE delivers the canonical message and replaces the optimistic entry
    } catch {
      // Remove optimistic message on failure and restore the draft
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setBody(text);
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  const groups = groupByDate(messages);

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50 shrink-0">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto gap-3">
          <button
            onClick={() => setLocation(`/rooms/${roomId}`)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-sans font-semibold text-[17px] truncate">
              {roomName || 'Room Chat'}
            </div>
            <div className="text-[12px] text-muted-foreground">Group chat</div>
          </div>
        </div>
      </header>

      {/* Message list */}
      <main className="flex-1 overflow-y-auto px-4 py-4 max-w-[480px] mx-auto w-full">
        {loadError && (
          <div className="text-center text-[14px] text-destructive py-8">{loadError}</div>
        )}
        {!loadError && messages.length === 0 && (
          <div className="text-center text-[15px] text-muted-foreground py-16 leading-relaxed">
            <p>No messages yet.</p>
            <p className="text-[13px] mt-1">Be the first to say something!</p>
          </div>
        )}

        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.date} className="space-y-3">
              {/* Date separator */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[11px] font-medium text-muted-foreground shrink-0">
                  {group.date}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {group.items.map(msg => {
                const isMe = msg.userId === user.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    {!isMe && (
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary text-[12px] font-semibold flex items-center justify-center shrink-0 self-end">
                        {msg.senderName.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                      {/* Sender name (only for others) */}
                      {!isMe && (
                        <span className="text-[11px] font-medium text-muted-foreground px-1">
                          {msg.senderName}
                        </span>
                      )}

                      {/* Bubble */}
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed break-words ${
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted text-foreground rounded-bl-md'
                        }`}
                      >
                        {msg.body}
                      </div>

                      {/* Time */}
                      <span className="text-[11px] text-muted-foreground px-1">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div ref={bottomRef} className="h-1" />
      </main>

      {/* Input bar */}
      <div className="shrink-0 border-t border-border/50 bg-background px-4 py-3 max-w-[480px] mx-auto w-full">
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Message…"
            rows={1}
            className="flex-1 resize-none bg-muted rounded-2xl px-4 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 max-h-[120px] overflow-y-auto"
            style={{ lineHeight: '1.5' }}
          />
          <button
            onClick={handleSend}
            disabled={!body.trim() || sending}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
