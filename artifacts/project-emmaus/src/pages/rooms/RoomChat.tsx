import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { apiGetMessages, apiGetStreamToken, apiSendMessage } from '@/lib/rooms-api';
import { getApiUrl } from '@/lib/api';
import { apiStartPresentation } from '@/lib/rooms-api-media';
import { ArrowLeft, Send, Paperclip, X } from 'lucide-react';
import type { RoomMessage, MediaAttachment } from '@/lib/rooms-types';
import { MediaMessageBubble } from '@/components/MediaMessageBubble';
import { AttachmentPicker } from '@/components/AttachmentPicker';

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

  // Attachment state
  const [pendingAttachment, setPendingAttachment] = useState<MediaAttachment | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Presentation permission — passed via navigation state from RoomDetail
  const [isLeader, setIsLeader] = useState(false);
  const [allowMemberPresent, setAllowMemberPresent] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [presentingMessageId, setPresentingMessageId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Load room name and context from history state
  useEffect(() => {
    const state = history.state as {
      roomName?: string;
      isLeader?: boolean;
      allowMemberPresent?: boolean;
      sessionId?: string | null;
    } | null;
    if (state?.roomName) setRoomName(state.roomName);
    if (state?.isLeader !== undefined) setIsLeader(Boolean(state.isLeader));
    if (state?.allowMemberPresent !== undefined) setAllowMemberPresent(Boolean(state.allowMemberPresent));
    if (state?.sessionId !== undefined) setSessionId(state.sessionId ?? null);
  }, []);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }, []);

  // SSE connection with manual reconnect
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
      if (currentEs) {
        currentEs.onerror = null;
        currentEs.onmessage = null;
        currentEs.close();
        currentEs = null;
      }
    }

    async function connect() {
      if (cancelled) return;
      let connectionHistoryLoaded = false;
      const connectionBuffer: RoomMessage[] = [];

      let token: string;
      try {
        token = await apiGetStreamToken(user!.id, String(roomId));
      } catch {
        scheduleReconnect();
        return;
      }

      if (cancelled) return;
      const es = new EventSource(getApiUrl(`/api/rooms/${String(roomId)}/messages/stream?token=${encodeURIComponent(token)}`));
      currentEs = es;

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as RoomMessage;
          if (!connectionHistoryLoaded) {
            connectionBuffer.push(msg);
          } else {
            setMessages(prev => mergeMessages(prev, [msg]));
            scrollToBottom();
          }
        } catch {
          // ignore malformed event
        }
      };

      es.onerror = () => {
        closeCurrentEs();
        scheduleReconnect();
      };

      try {
        const history = await apiGetMessages(user!.id, String(roomId));
        if (cancelled) { closeCurrentEs(); return; }
        connectionHistoryLoaded = true;
        const merged = mergeMessages(history, connectionBuffer);
        setMessages(merged);
        scrollToBottom();
        attempt = 0;
      } catch {
        closeCurrentEs();
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (currentEs) {
        currentEs.onerror = null;
        currentEs.onmessage = null;
        currentEs.close();
      }
    };
  }, [user, roomId, scrollToBottom]);

  const handleSend = async () => {
    if ((!body.trim() && !pendingAttachment) || !user || !roomId || sending) return;
    const text = body.trim();
    const attachment = pendingAttachment;
    setBody('');
    setPendingAttachment(null);
    setSending(true);

    // Optimistic message
    const optimistic: RoomMessage = {
      id: `opt-${Date.now()}`,
      roomId: String(roomId),
      userId: user.id,
      senderName: user.preferredName || 'You',
      body: text,
      createdAt: new Date().toISOString(),
      attachment,
    };
    setMessages(prev => [optimistic, ...prev]);
    scrollToBottom();

    try {
      await apiSendMessage(user.id, String(roomId), text, attachment ?? undefined);
    } catch {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setBody(text);
      if (attachment) setPendingAttachment(attachment);
    } finally {
      setSending(false);
    }
  };

  const handlePresent = async (msg: RoomMessage) => {
    if (!user || !roomId || !msg.attachment) return;
    setPresentingMessageId(msg.id);
    try {
      await apiStartPresentation(user.id, String(roomId), {
        messageId: msg.id,
        filename: msg.attachment.filename,
        mediaType: msg.attachment.type,
        objectPath: msg.attachment.objectPath,
        sessionId,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not start presentation.');
    } finally {
      setPresentingMessageId(null);
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
              {roomName || 'Group Discussion'}
            </div>
            <div className="text-[12px] text-muted-foreground">Group Discussion</div>
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
                // A member can present their own content if allowMemberPresent is on
                const canPresent = isLeader || (allowMemberPresent && isMe);

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

                      {/* Media attachment */}
                      {msg.attachment ? (
                        <div className={`max-w-[240px] ${isMe ? 'self-end' : 'self-start'}`}>
                          <MediaMessageBubble
                            attachment={msg.attachment}
                            isMe={isMe}
                            canPresent={canPresent && !msg.id.startsWith('opt-')}
                            onPresent={
                              canPresent && !msg.id.startsWith('opt-')
                                ? () => handlePresent(msg)
                                : undefined
                            }
                          />
                          {presentingMessageId === msg.id && (
                            <p className="text-[11px] text-primary mt-1">Starting presentation…</p>
                          )}
                          {/* Text body below attachment */}
                          {msg.body && (
                            <div
                              className={`mt-1.5 px-3 py-2 rounded-2xl text-[14px] leading-relaxed break-words ${
                                isMe
                                  ? 'bg-primary text-primary-foreground rounded-br-md'
                                  : 'bg-muted text-foreground rounded-bl-md'
                              }`}
                            >
                              {msg.body}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Text-only bubble */
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed break-words ${
                            isMe
                              ? 'bg-primary text-primary-foreground rounded-br-md'
                              : 'bg-muted text-foreground rounded-bl-md'
                          }`}
                        >
                          {msg.body}
                        </div>
                      )}

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

      {/* Pending attachment preview */}
      {pendingAttachment && (
        <div className="shrink-0 border-t border-border/30 bg-muted/30 px-4 py-2 max-w-[480px] mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="flex-1 text-[13px] text-foreground truncate">
              📎 {pendingAttachment.filename}
            </div>
            <button
              onClick={() => setPendingAttachment(null)}
              className="text-muted-foreground hover:text-foreground p-1"
              aria-label="Remove attachment"
            >
              <X size={16} />
            </button>
          </div>
          <input
            type="text"
            value={pendingAttachment.caption ?? ''}
            onChange={e => setPendingAttachment(prev => prev ? { ...prev, caption: e.target.value } : prev)}
            placeholder="Add a caption (optional)…"
            className="w-full mt-1.5 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-border/50 bg-background px-4 py-3 max-w-[480px] mx-auto w-full">
        <div className="flex items-end gap-2">
          {/* Attachment button */}
          <button
            onClick={() => setShowPicker(true)}
            className="w-10 h-10 rounded-full border border-border bg-muted text-muted-foreground flex items-center justify-center shrink-0 hover:text-foreground transition-colors"
            aria-label="Add attachment"
          >
            <Paperclip size={18} />
          </button>

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
            disabled={(!body.trim() && !pendingAttachment) || sending}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-40 transition-opacity"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Attachment picker */}
      {showPicker && (
        <AttachmentPicker
          userId={user.id}
          roomId={String(roomId)}
          onAttachment={attachment => {
            setPendingAttachment(attachment);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
