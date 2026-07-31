import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { apiGetMessages, apiSendMessage } from '@/lib/rooms-api';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Send } from 'lucide-react';
import type { RoomMessage } from '@/lib/rooms-types';

const POLL_INTERVAL_MS = 10_000;

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

  // Messages come newest-first from the API; reverse for display
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFirstLoad = useRef(true);

  const fetchMessages = useCallback(async (scrollToBottom = false) => {
    if (!user || !roomId) return;
    try {
      const msgs = await apiGetMessages(user.id, String(roomId));
      setMessages(msgs);
      setLoadError('');
      if (scrollToBottom) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    } catch (err) {
      if (isFirstLoad.current) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load messages');
      }
    } finally {
      isFirstLoad.current = false;
    }
  }, [user, roomId]);

  // Load room name from history state or referrer title
  useEffect(() => {
    const state = history.state as { roomName?: string } | null;
    if (state?.roomName) setRoomName(state.roomName);
  }, []);

  // Initial load + polling
  useEffect(() => {
    fetchMessages(true);
    intervalRef.current = setInterval(() => fetchMessages(false), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchMessages]);

  const handleSend = async () => {
    if (!body.trim() || !user || !roomId || sending) return;
    const text = body.trim();
    setBody('');
    setSending(true);

    // Optimistic message
    const optimistic: RoomMessage = {
      id: `opt-${Date.now()}`,
      roomId: String(roomId),
      userId: user.id,
      senderName: user.preferredName || 'You',
      body: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [optimistic, ...prev]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      await apiSendMessage(user.id, String(roomId), text);
      // Refresh to get server-canonical message
      await fetchMessages(false);
    } catch {
      // Remove optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setBody(text); // restore
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
