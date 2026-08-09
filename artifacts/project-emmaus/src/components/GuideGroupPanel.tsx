/**
 * GuideGroupPanel.tsx — Leader-only full-screen Meeting Tools overlay.
 *
 * Opened by the "Meeting Tools" card in Phase 2 (Meeting in Progress).
 * Provides content navigation, discussion controls, and session conclusion.
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

import { useState } from 'react';
import {
  BookOpen, ArrowLeft, MessageSquare,
  HandHeart, BarChart2, Sparkles, StopCircle,
  CheckCircle2, X, Loader2, ChevronRight, Video, VideoOff,
} from 'lucide-react';
import {
  apiEndSession,
  apiChangeMode,
  apiNavigate,
  apiCreatePoll,
  apiCompleteSession,
} from '@/lib/rooms-api';
import type { RoomSession, ScriptureRef, SessionCompleteSummary } from '@/lib/rooms-types';

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
  /** Whether this room type supports Live Video. */
  videoEligible?: boolean;
  /** Whether a Live Video session is currently active. */
  videoActive?: boolean;
  /** Called when leader taps "Start Live Video". */
  onStartVideo?: () => Promise<void>;
  /** Called when leader taps "End Live Video". */
  onEndVideo?: () => Promise<void>;
}

type PanelView =
  | 'main'
  | 'scripture'
  | 'poll-setup'
  | 'complete-confirm';

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
  videoEligible = false,
  videoActive = false,
  onStartVideo,
  onEndVideo,
}: GuideGroupPanelProps) {
  const [view, setView] = useState<PanelView>('main');
  const [busy, setBusy] = useState<string | null>(null);

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

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleOpenTodaysStep = () => run('open-step', async () => {
    await apiNavigate(userId, roomId, { stepId: 'today', leaderName });
  });

  const handlePreviousStep = () => run('prev-step', async () => {
    await apiNavigate(userId, roomId, { stepId: 'previous', leaderName });
  });

  const handleNextStep = () => run('next-step', async () => {
    await apiNavigate(userId, roomId, { stepId: 'next', leaderName });
  });

  // ── Modes ──────────────────────────────────────────────────────────────────

  const handleStartDiscussion = () => run('discussion', async () => {
    await apiChangeMode(userId, roomId, 'discussion', leaderName);
    onClose();
  });

  const handlePrayerTime = () => run('prayer', async () => {
    await apiChangeMode(userId, roomId, 'prayer', leaderName);
    onClose();
  });

  const handleAskEmmausTogether = () => {
    onClose();
    onOpenAskEmmaus?.();
  };

  // ── Scripture picker (Present Bible) ─────────────────────────────────────

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
    <div className="fixed inset-0 z-50 bg-background flex flex-col max-w-[480px] mx-auto">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between px-5 pt-safe-or-5 pt-5 pb-4 border-b border-border/60">
        {view !== 'main' ? (
          <button
            onClick={() => setView('main')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
        ) : (
          <div className="w-10" />
        )}

        <h1 className="text-[18px] font-bold text-foreground">
          {view === 'main' && 'Meeting Tools'}
          {view === 'scripture' && 'Present Bible'}
          {view === 'poll-setup' && 'Launch Poll'}
          {view === 'complete-confirm' && 'Complete Session'}
        </h1>

        <button
          onClick={onClose}
          className="p-2 -mr-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close Meeting Tools"
        >
          <X size={22} />
        </button>
      </div>

      {/* ── Main view ──────────────────────────────────────────────────────── */}
      {view === 'main' && (
        <div className="flex-1 overflow-y-auto pb-safe-or-8 pb-8">

          {/* ── CONTENT section ─────────────────────────────────────────── */}
          <div className="px-5 pt-6">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Content</p>
            <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
              <ToolRow
                icon={<BookOpen size={18} />}
                label="Open Today's Study"
                description="Navigate everyone to the current step"
                loading={busy === 'open-step'}
                disabled={!sessionActive}
                onClick={handleOpenTodaysStep}
              />
              <ToolRow
                icon={<ArrowLeft size={18} />}
                label="Previous Step"
                description="Go back one step for the group"
                loading={busy === 'prev-step'}
                disabled={!sessionActive}
                onClick={handlePreviousStep}
              />
              <ToolRow
                icon={<ChevronRight size={18} />}
                label="Next Step"
                description="Advance the group to the next step"
                loading={busy === 'next-step'}
                disabled={!sessionActive}
                onClick={handleNextStep}
              />
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

          {/* ── DISCUSSION section ──────────────────────────────────────── */}
          <div className="px-5 pt-6">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Discussion</p>
            <div className="rounded-2xl border border-border overflow-hidden divide-y divide-border">
              <ToolRow
                icon={<MessageSquare size={18} />}
                label="Open Discussion"
                description="Switch group to discussion mode"
                loading={busy === 'discussion'}
                disabled={!sessionActive}
                onClick={handleStartDiscussion}
              />
              <ToolRow
                icon={<HandHeart size={18} />}
                label="Prayer Time"
                description="Switch group to prayer mode"
                loading={busy === 'prayer'}
                disabled={!sessionActive}
                onClick={handlePrayerTime}
              />
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
            </div>
          </div>

          {/* ── LIVE VIDEO section ─────────────────────────────────────── */}
          {videoEligible && (
            <div className="px-5 pt-6">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">Live Video</p>
              <div className="rounded-2xl border border-border overflow-hidden">
                {!videoActive ? (
                  <ToolRow
                    icon={<Video size={18} />}
                    label="Start Live Video"
                    description="Start a video session for the group"
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
              </div>
            </div>
          )}

          {/* ── SESSION CONCLUSION section ──────────────────────────────── */}
          <div className="px-5 pt-6">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-3">End Meeting</p>
            <div className="space-y-2">
              <button
                onClick={() => setView('complete-confirm')}
                disabled={!sessionActive || busy === 'complete-session'}
                className="w-full py-4 rounded-2xl bg-emerald-600 text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-emerald-700 transition-colors"
              >
                {busy === 'complete-session'
                  ? <Loader2 size={18} className="animate-spin" />
                  : <CheckCircle2 size={18} />}
                Complete Meeting
              </button>
              <button
                onClick={handleEndSession}
                disabled={!sessionActive || busy === 'end-session'}
                className="w-full py-3 rounded-xl text-[13px] text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                {busy === 'end-session'
                  ? <Loader2 size={14} className="animate-spin" />
                  : <StopCircle size={14} />}
                End Without Completing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scripture picker ───────────────────────────────────────────────── */}
      {view === 'scripture' && (
        <div className="flex-1 overflow-y-auto px-5 pb-safe-or-8 pb-8 space-y-5 pt-5">
          {/* Book picker */}
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

          {/* Chapter + verse inputs */}
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

          {/* Preview */}
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
        <div className="flex-1 overflow-y-auto px-5 pb-safe-or-8 pb-8 space-y-5 pt-5">
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

      {/* ── Session complete confirm ─────────────────────────────────────── */}
      {view === 'complete-confirm' && (
        <div className="flex-1 overflow-y-auto px-5 pb-safe-or-8 pb-8 space-y-5 pt-5">
          <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 space-y-3">
            <p className="text-[16px] font-bold text-emerald-800 dark:text-emerald-300">Session Complete</p>
            <div className="space-y-1.5">
              {['Studied together', 'Discussed the Word', 'Prayed together'].map(item => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-[14px] text-emerald-700 dark:text-emerald-300">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[14px] text-muted-foreground leading-relaxed">
            This will record the session, preserve all notes and prayer requests, and let members know the session is complete.
          </p>

          <div className="flex gap-2">
            <button
              onClick={handleCompleteSession}
              disabled={busy === 'complete-session'}
              className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-emerald-700 transition-colors"
            >
              {busy === 'complete-session' ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
              Complete Session
            </button>
            <button
              onClick={() => setView('main')}
              className="flex-1 py-4 rounded-2xl border border-border text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
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
