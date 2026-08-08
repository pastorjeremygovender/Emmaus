/**
 * SharedNotesPanel.tsx — Shared group notes for a guided Room session.
 *
 * Any member can post a short note. Leaders can pin one note at the top.
 * New notes from other members arrive via SSE (passed as incomingNotes).
 * Displays as a bottom sheet.
 */

import { useState, useEffect, useRef } from 'react';
import { X, Pin, Send, Loader2, StickyNote } from 'lucide-react';
import { apiGetSharedNotes, apiAddSharedNote, apiPinNote } from '@/lib/rooms-api';
import type { SharedNote } from '@/lib/rooms-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface SharedNotesPanelProps {
  roomId: string;
  userId: string;
  sessionId: string;
  isLeader: boolean;
  userName: string;
  /** New notes arriving via SSE from the parent. */
  incomingNotes?: SharedNote[];
  /** Note pin-status changes from SSE. noteId + isPinned. */
  incomingPinChange?: { noteId: string; isPinned: boolean };
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(isoString));
  } catch {
    return '';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SharedNotesPanel({
  roomId,
  userId,
  sessionId,
  isLeader,
  userName,
  incomingNotes = [],
  incomingPinChange,
  onClose,
}: SharedNotesPanelProps) {
  const [notes, setNotes] = useState<SharedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Load notes on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    apiGetSharedNotes(userId, roomId, sessionId)
      .then(n => setNotes(n))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, roomId, sessionId]);

  // ── Merge incoming SSE notes ────────────────────────────────────────────────
  useEffect(() => {
    if (incomingNotes.length === 0) return;
    setNotes(prev => {
      const existingIds = new Set(prev.map(n => n.id));
      const newOnes = incomingNotes.filter(n => !existingIds.has(n.id));
      if (!newOnes.length) return prev;
      const merged = [...prev, ...newOnes];
      // Sort: pinned first, then chronological
      return merged.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    });
    // Auto-scroll to bottom on new note
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 100);
  }, [incomingNotes]);

  // ── Sync pin changes from SSE ───────────────────────────────────────────────
  useEffect(() => {
    if (!incomingPinChange) return;
    const { noteId, isPinned } = incomingPinChange;
    setNotes(prev => {
      const updated = prev.map(n => ({
        ...n,
        isPinned: n.id === noteId ? isPinned : (isPinned ? false : n.isPinned),
      }));
      return updated.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    });
  }, [incomingPinChange]);

  // ── Post a note ─────────────────────────────────────────────────────────────
  const handlePost = async () => {
    const trimmed = text.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const note = await apiAddSharedNote(userId, roomId, sessionId, trimmed, userName);
      setNotes(prev => [...prev, note]);
      setText('');
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  // ── Pin / unpin ─────────────────────────────────────────────────────────────
  const handlePin = async (note: SharedNote) => {
    setPinning(note.id);
    try {
      const newPin = !note.isPinned;
      await apiPinNote(userId, roomId, note.id, newPin);
      setNotes(prev => {
        const updated = prev.map(n => ({
          ...n,
          isPinned: n.id === note.id ? newPin : (newPin ? false : n.isPinned),
        }));
        return updated.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to pin note');
    } finally {
      setPinning(null);
    }
  };

  const pinnedNote = notes.find(n => n.isPinned);
  const unpinnedNotes = notes.filter(n => !n.isPinned);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-border/60 shrink-0">
        <div className="flex items-center gap-2">
          <StickyNote size={18} className="text-primary shrink-0" />
          <h2 className="font-semibold text-[16px] text-foreground">Group Notes</h2>
          {notes.length > 0 && (
            <span className="text-[12px] text-muted-foreground">
              ({notes.length})
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl"
          aria-label="Close notes"
        >
          <X size={20} />
        </button>
      </header>

      {/* Notes list */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : notes.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <StickyNote size={28} className="text-muted-foreground/40 mx-auto" />
            <p className="text-[14px] text-muted-foreground">No notes yet</p>
            <p className="text-[12px] text-muted-foreground/60">
              Be the first to share something from today's study.
            </p>
          </div>
        ) : (
          <>
            {/* Pinned note (always at top) */}
            {pinnedNote && (
              <NoteCard
                note={pinnedNote}
                isLeader={isLeader}
                pinning={pinning === pinnedNote.id}
                onPin={handlePin}
              />
            )}

            {/* Unpinned notes */}
            {unpinnedNotes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                isLeader={isLeader}
                pinning={pinning === note.id}
                onPin={handlePin}
              />
            ))}
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-safe-or-6 pb-6 pt-3 border-t border-border/60 bg-background shrink-0">
        <div className="flex gap-2.5 items-end">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlePost();
              }
            }}
            placeholder="Share a note…"
            rows={2}
            maxLength={500}
            className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-muted/30 text-[14px] text-foreground outline-none focus:border-primary resize-none"
          />
          <button
            onClick={handlePost}
            disabled={!text.trim() || posting}
            className="p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Post note"
          >
            {posting
              ? <Loader2 size={17} className="animate-spin" />
              : <Send size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

interface NoteCardProps {
  note: SharedNote;
  isLeader: boolean;
  pinning: boolean;
  onPin: (note: SharedNote) => void;
}

function NoteCard({ note, isLeader, pinning, onPin }: NoteCardProps) {
  return (
    <div
      className={`px-4 py-3.5 rounded-2xl border transition-all ${
        note.isPinned
          ? 'bg-primary/5 border-primary/20'
          : 'bg-card border-border/60'
      }`}
    >
      {/* Pin badge */}
      {note.isPinned && (
        <div className="flex items-center gap-1 mb-2">
          <Pin size={11} className="text-primary shrink-0" />
          <p className="text-[10px] font-semibold text-primary uppercase tracking-wider">
            Pinned
          </p>
        </div>
      )}

      {/* Author + time */}
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[12px] font-semibold text-foreground">{note.authorName}</p>
        <div className="flex items-center gap-2">
          <p className="text-[11px] text-muted-foreground">{formatTime(note.createdAt)}</p>
          {isLeader && (
            <button
              onClick={() => onPin(note)}
              disabled={pinning}
              className={`p-1 rounded-lg transition-colors disabled:opacity-40 ${
                note.isPinned
                  ? 'text-primary bg-primary/10 hover:bg-primary/20'
                  : 'text-muted-foreground hover:text-primary hover:bg-muted'
              }`}
              title={note.isPinned ? 'Unpin note' : 'Pin note'}
              aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
            >
              {pinning
                ? <Loader2 size={13} className="animate-spin" />
                : <Pin size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Note text */}
      <p className="text-[14px] text-foreground leading-relaxed">{note.text}</p>
    </div>
  );
}
