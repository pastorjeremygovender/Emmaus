/**
 * GuideGroupPanel.tsx — Leader-only full-screen Meeting Tools overlay.
 *
 * Opened by the "Meeting Tools" card in Phase 2 (Meeting in Progress).
 *
 * Props:
 *   roomId      — current room
 *   userId      — caller's userId
 *   leaderName  — display name for attribution in events
 *   isOpen      — whether the panel is visible
 *   onClose     — close the panel
 *   activeSession — current RoomSession (or null)
 *   onSessionEnded   — called when a session ends (End Without Completing)
 *   onSessionComplete — called when a session is properly completed
 */

import { useState, useEffect } from 'react';
import {
  ArrowLeft, BookOpen, MessageSquare,
  BarChart2, Sparkles,
  X, Loader2, ChevronRight, Video, VideoOff, Presentation,
  Image, FileText, Film, Mic, Link as LinkIcon,
} from 'lucide-react';
import {
  apiEndSession,
  apiChangeMode,
  apiNavigate,
  apiCreatePoll,
  apiCompleteSession,
} from '@/lib/rooms-api';
import { apiGetRoomMedia, apiStartPresentation } from '@/lib/rooms-api-media';
import type { RoomSession, ScriptureRef, SessionCompleteSummary, RoomMediaItem, MediaAttachmentType } from '@/lib/rooms-types';

const MEDIA_TYPE_ICON: Record<MediaAttachmentType, React.ReactNode> = {
  image:    <Image size={18} />,
  pdf:      <FileText size={18} />,
  video:    <Film size={18} />,
  voice:    <Mic size={18} />,
  document: <FileText size={18} />,
  link:     <LinkIcon size={18} />,
};

// ─── Common Books picker ──────────────────────────────────────────────────────

const COMMON_BOOKS = [
  'Genesis', 'Exodus', 'Psalms', 'Proverbs', 'Isaiah',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians',
  'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', 'Hebrews', 'James', '1 Peter', 'Revelation',
];

interface GuideGroupPanelProps {
  roomId: string;
  userId: string;
  leaderName: string;
  isOpen: boolean;
  onClose: () => void;
  activeSession: RoomSession | null;
  onSessionEnded: () => void;
  /**
   * Called immediately after `apiCompleteSession` resolves, with the
   * authoritative summary returned by the server.  The leader's completion
   * card is shown from this callback rather than waiting for the SSE event,
   * which may be briefly delayed or absent on poor connections.
   */
  onSessionComplete: (summary: SessionCompleteSummary) => void;
  /** Called when leader taps "Ask Emmaus Together" — opens SharedAskEmmausPanel. */
  onOpenAskEmmaus?: () => void;
  /** Called when leader taps "Open Discussion" — navigates directly to group chat. */
  onOpenDiscussion?: () => void;
  /** Whether this room type supports Live Video (retained for API compat; no longer gates the UI). */
  videoEligible?: boolean;
  /** Whether a Live Video session is currently active. */
  videoActive?: boolean;
  /** Called when leader taps "Start Live Video". */
  onStartVideo?: () => Promise<void>;
  /** Called when leader taps "End Live Video". */
  onEndVideo?: () => Promise<void>;
  /** Called when leader taps "End Meeting" inside the tools panel (before confirmation). */
  onEndMeeting?: () => void;
}

type PanelView =
  | 'main'
  | 'scripture'
  | 'poll-setup'
  | 'media-picker';

interface PollSetup {
  question: string;
  type: 'multiple_choice' | 'yes_no';
  options: string[];
}

export function GuideGroupPanel({
  roomId,
  userId,
  leaderName,
  isOpen,
  onClose,
  activeSession,
  onSessionEnded,
  onSessionComplete,
  onOpenAskEmmaus,
  onOpenDiscussion,
  videoActive = false,
  onStartVideo,
  onEndVideo,
  onEndMeeting,
}: GuideGroupPanelProps) {
  const [view, setView] = useState<PanelView>('main');
  const [busy, setBusy] = useState<string | null>(null);
  const [mediaItems, setMediaItems] = useState<RoomMediaItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  // Scripture picker state
  const [book, setBook] = useState('John');
  const [chapter, setChapter] = useState(1);
  const [verseStart, setVerseStart] = useState('');
  const [verseEnd, setVerseEnd] = useState('');

  // Poll setup state
  const [poll, setPoll] = useState<PollSetup>({
    question: '',
    type: 'yes_no',
    options: ['Yes', 'No'],
  });

  if (!isOpen) return null;

  const sessionActive = activeSession !== null;

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  // ── Session conclusion ─────────────────────────────────────────────────────

  const handleCompleteSession = () => run('complete-session', async () => {
    const response = await apiCompleteSession(userId, roomId);
    onSessionComplete(response.summary);
    setView('main');
    onClose();
  });

  const handleEndSession = () => run('end-session', async () => {
    await apiEndSession(userId, roomId, 'ended');
    onSessionEnded();
    setView('main');
    onClose();
  });

  // ── Scripture picker (Present Bible) ──────────────────────────────────────

  const handleOpenScripture = () => run('scripture', async () => {
    const ref: ScriptureRef = {
      book,
      chapter,
      ...(verseStart ? { verseStart: parseInt(verseStart, 10) } : {}),
      ...(verseEnd ? { verseEnd: parseInt(verseEnd, 10) } : {}),
      displayLabel: verseStart
        ? `${book} ${chapter}:${verseStart}${verseEnd ? `–${verseEnd}` : ''}`
        : `${book} ${chapter}`,
    };
    await apiNavigate(userId, roomId, { scripture: ref, leaderName });
    setView('main');
  });

  // ── Discussion ─────────────────────────────────────────────────────────────

  const handleStartDiscussion = () => run('discussion', async () => {
    await apiChangeMode(userId, roomId, 'discussion', leaderName);
    onClose();
    onOpenDiscussion?.();
  });

  const handleAskEmmausTogether = () => {
    onClose();
    onOpenAskEmmaus?.();
  };

  // ── Poll ───────────────────────────────────────────────────────────────────

  const handleLaunchPoll = () => run('poll', async () => {
    if (!activeSession) {
      alert('Start a session first before launching a poll.');
      return;
    }
    await apiCreatePoll(userId, roomId, {
      sessionId: activeSession.id,
      question: poll.question.trim() || 'What do you think?',
      pollType: poll.type,
      options: poll.type === 'yes_no' ? ['Yes', 'No'] : poll.options.filter(o => o.trim()),
    });
    setView('main');
    onClose();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render — full-screen overlay
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden max-w-[480px] mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-safe-or-5 pt-5 pb-4 border-b border-border/60">
        <button
          onClick={view !== 'main' ? () => setView('main') : onClose}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label={view !== 'main' ? 'Back' : 'Close Meeting Tools'}
        >
          <ArrowLeft size={22} />
        </button>

        <h1 className="text-[18px] font-bold text-foreground">
          {view === 'main' && 'Meeting Tools'}
          {view === 'scripture' && 'Present Bible'}
          {view === 'poll-setup' && 'Launch Poll'}
          {view === 'media-picker' && 'Present Shared Media'}
        </h1>

        {/* Spacer to balance the back button and keep the title centred */}
        <div className="w-[44px]" />
      </div>

      {/* ── Main view ──────────────────────────────────────────────────────── */}
      {view === 'main' && (
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 pt-6 pb-24 space-y-6">

            {/* ── MEETING ─────────────────────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Meeting</p>
              <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
                {!videoActive ? (
                  <ToolRow
                    icon={<Video size={18} />}
                    label="Start Live Video"
                    description="Start a live video meeting for everyone in this Group"
                    loading={busy === 'start-video'}
                    disabled={!sessionActive}
                    onClick={() => run('start-video', async () => { await onStartVideo?.(); })}
                  />
                ) : (
                  <ToolRow
                    icon={<VideoOff size={18} />}
                    label="End Live Video"
                    description="End the video session for everyone"
                    loading={busy === 'end-video'}
                    disabled={false}
                    onClick={() => run('end-video', async () => { await onEndVideo?.(); })}
                  />
                )}
                <ToolRow
                  icon={<BookOpen size={18} />}
                  label="Present Bible"
                  description="Open a specific passage for everyone"
                  loading={busy === 'scripture'}
                  disabled={!sessionActive}
                  onClick={() => setView('scripture')}
                />
              </div>
            </div>

            {/* ── DISCUSSION ──────────────────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Discussion</p>
              <div className="rounded-2xl border border-border overflow-hidden">
                <ToolRow
                  icon={<MessageSquare size={18} />}
                  label="Open Discussion"
                  description="Open the group chat for everyone"
                  loading={busy === 'discussion'}
                  disabled={!sessionActive}
                  onClick={handleStartDiscussion}
                />
              </div>
            </div>

            {/* ── INTERACTION ─────────────────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Interaction</p>
              <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
                <ToolRow
                  icon={<BarChart2 size={18} />}
                  label="Launch Poll"
                  description="Ask the group a question"
                  loading={false}
                  disabled={!sessionActive}
                  onClick={() => setView('poll-setup')}
                />
                <ToolRow
                  icon={<Sparkles size={18} />}
                  label="Ask Emmaus Together"
                  description="Open a shared Emmaus session"
                  loading={busy === 'ask-emmaus'}
                  disabled={!sessionActive}
                  onClick={handleAskEmmausTogether}
                />
                <ToolRow
                  icon={<Presentation size={18} />}
                  label="Present Shared Media"
                  description="Show an image, video, or document from Group Discussion"
                  loading={loadingMedia}
                  disabled={!sessionActive}
                  onClick={async () => {
                    setLoadingMedia(true);
                    try {
                      const items = await apiGetRoomMedia(userId, roomId);
                      setMediaItems(items);
                      setView('media-picker');
                    } catch {
                      alert('Could not load shared media. Please try again.');
                    } finally {
                      setLoadingMedia(false);
                    }
                  }}
                />
              </div>
            </div>

            {/* ── SESSION ─────────────────────────────────────────────────── */}
            <div>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Session</p>
              <div className="rounded-2xl border border-border overflow-hidden">
                <ToolRow
                  icon={<X size={18} />}
                  label="End Meeting"
                  description="Complete and close this meeting"
                  loading={false}
                  disabled={!sessionActive}
                  onClick={() => { onClose(); onEndMeeting?.(); }}
                />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Media picker ──────────────────────────────────────────────────── */}
      {view === 'media-picker' && (
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-4">
          {mediaItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Presentation size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-[15px] font-medium">No media shared yet</p>
              <p className="text-[13px] mt-1">Members can share photos, PDFs, and more in Group Discussion.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {mediaItems.map(item => (
                <button
                  key={item.messageId}
                  disabled={busy === `present-${item.messageId}`}
                  onClick={() => run(`present-${item.messageId}`, async () => {
                    await apiStartPresentation(userId, roomId, {
                      messageId: item.messageId,
                      filename: item.attachment.filename,
                      mediaType: item.attachment.type,
                      objectPath: item.attachment.objectPath,
                      sessionId: activeSession?.id ?? null,
                    });
                    setView('main');
                    onClose();
                  })}
                  className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl border border-border bg-card hover:bg-muted/50 transition-all text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {MEDIA_TYPE_ICON[item.attachment.type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-foreground truncate">{item.attachment.filename}</p>
                    <p className="text-[12px] text-muted-foreground">Shared by {item.senderName}</p>
                  </div>
                  {busy === `present-${item.messageId}` ? (
                    <Loader2 size={16} className="animate-spin text-primary shrink-0" />
                  ) : (
                    <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Scripture picker ───────────────────────────────────────────────── */}
      {view === 'scripture' && (
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-5 space-y-5">
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Book</label>
            <div className="flex flex-wrap gap-2">
              {COMMON_BOOKS.map(b => (
                <button
                  key={b}
                  onClick={() => setBook(b)}
                  className={`px-3 py-1.5 rounded-xl text-[13px] font-medium border transition-all ${
                    book === b
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Chapter</label>
              <input
                type="number"
                min={1}
                value={chapter}
                onChange={e => setChapter(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary"
              />
            </div>
            <div className="flex-1">
              <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Verse (optional)</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  placeholder="from"
                  value={verseStart}
                  onChange={e => setVerseStart(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary"
                />
                <span className="text-muted-foreground shrink-0 text-[13px]">–</span>
                <input
                  type="number"
                  min={1}
                  placeholder="to"
                  value={verseEnd}
                  onChange={e => setVerseEnd(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-muted/40 border border-border/60">
            <p className="text-[13px] text-muted-foreground">Will open for everyone:</p>
            <p className="text-[15px] font-semibold text-foreground mt-1">
              {verseStart
                ? `${book} ${chapter}:${verseStart}${verseEnd ? `–${verseEnd}` : ''}`
                : `${book} ${chapter}`}
            </p>
          </div>

          <button
            onClick={handleOpenScripture}
            disabled={busy === 'scripture'}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy === 'scripture' ? <Loader2 size={17} className="animate-spin" /> : <BookOpen size={17} />}
            Open for Everyone
          </button>
        </div>
      )}

      {/* ── Poll setup ─────────────────────────────────────────────────────── */}
      {view === 'poll-setup' && (
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-5 space-y-5">
          <div>
            <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Question</label>
            <textarea
              value={poll.question}
              onChange={e => setPoll(p => ({ ...p, question: e.target.value }))}
              placeholder="e.g. What stood out most to you?"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          <div>
            <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Type</label>
            <div className="flex gap-2">
              {(['yes_no', 'multiple_choice'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setPoll(p => ({
                    ...p,
                    type: t,
                    options: t === 'yes_no'
                      ? ['Yes', 'No']
                      : (p.options.length > 2 ? p.options : ['Option A', 'Option B', 'Option C']),
                  }))}
                  className={`flex-1 py-3 rounded-xl text-[14px] font-medium border transition-all ${
                    poll.type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {t === 'yes_no' ? 'Yes / No' : 'Multiple Choice'}
                </button>
              ))}
            </div>
          </div>

          {poll.type === 'multiple_choice' && (
            <div className="space-y-2">
              <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block">Options</label>
              {poll.options.map((opt, i) => (
                <input
                  key={i}
                  value={opt}
                  onChange={e => {
                    const opts = [...poll.options];
                    opts[i] = e.target.value;
                    setPoll(p => ({ ...p, options: opts }));
                  }}
                  placeholder={`Option ${i + 1}`}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-[14px] text-foreground outline-none focus:border-primary"
                />
              ))}
            </div>
          )}

          <button
            onClick={handleLaunchPoll}
            disabled={busy === 'poll' || !poll.question.trim()}
            className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy === 'poll' ? <Loader2 size={17} className="animate-spin" /> : <BarChart2 size={17} />}
            Launch Poll
          </button>
        </div>
      )}

    </div>
  );
}

// ─── ToolRow — full-width action row with icon, label, description ────────────

interface ToolRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ToolRow({ icon, label, description, loading, disabled, onClick }: ToolRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center gap-4 px-4 py-4 bg-card hover:bg-muted/50 transition-all disabled:opacity-40 disabled:pointer-events-none text-left"
    >
      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-muted-foreground">
        {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-foreground">{label}</p>
        <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
      </div>
      <ChevronRight size={16} className="text-muted-foreground shrink-0" />
    </button>
  );
}
