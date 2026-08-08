/**
 * GuideGroupPanel.tsx — Leader-only bottom sheet for guiding a Room session.
 *
 * Visible only to Authorized Room Leaders (admin, pastor, superAdmin, or
 * explicit leader flag). Provides 11 actions to guide the group in real time.
 *
 * Props:
 *   roomId      — current room
 *   userId      — caller's userId
 *   leaderName  — display name for attribution in events
 *   isOpen      — whether the panel is visible
 *   onClose     — close the panel
 *   activeSession — current RoomSession (or null)
 *   onSessionStarted — called when a session is created
 *   onSessionEnded   — called when a session ends
 */

import { useState } from 'react';
import {
  BookOpen, ArrowLeft, ArrowRight, MessageSquare,
  HandHeart, BarChart2, Sparkles, Video, StopCircle,
  CheckCircle2, X, Loader2, ChevronRight, MapPin,
} from 'lucide-react';
import {
  apiStartSession,
  apiEndSession,
  apiChangeMode,
  apiNavigate,
  apiCreatePoll,
  apiCompleteSession,
} from '@/lib/rooms-api';
import type { RoomSession, ScriptureRef, SessionCompleteSummary } from '@/lib/rooms-types';

// ─── Session stage plan ──────────────────────────────────────────────────────

const SESSION_STAGES: { id: string; label: string; mode: 'study' | 'discussion' | 'prayer' | null }[] = [
  { id: 'study',      label: 'Study',      mode: 'study' },
  { id: 'scripture',  label: 'Scripture',  mode: null },
  { id: 'discussion', label: 'Discussion', mode: 'discussion' },
  { id: 'prayer',     label: 'Prayer',     mode: 'prayer' },
  { id: 'complete',   label: 'Complete',   mode: null },
];

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
  onSessionStarted: (session: RoomSession) => void;
  onSessionEnded: () => void;
  /**
   * Called immediately after `apiCompleteSession` resolves, with the
   * authoritative summary returned by the server.  The leader's completion
   * card is shown from this callback rather than waiting for the SSE event,
   * which may be briefly delayed or absent on poor connections.
   */
  onSessionComplete: (summary: SessionCompleteSummary) => void;
  onOpenVideo?: () => void;
  onEndVideo?: () => void;
  videoActive?: boolean;
  /** Called when leader taps "Ask Emmaus Together" — opens SharedAskEmmausPanel. */
  onOpenAskEmmaus?: () => void;
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
  onSessionStarted,
  onSessionEnded,
  onSessionComplete,
  onOpenVideo,
  onEndVideo,
  videoActive = false,
  onOpenAskEmmaus,
}: GuideGroupPanelProps) {
  const [view, setView] = useState<PanelView>('main');
  const [busy, setBusy] = useState<string | null>(null); // which action is loading

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

  // ── Start / End Session ────────────────────────────────────────────────────

  const handleStartSession = () => run('start-session', async () => {
    const session = await apiStartSession(userId, roomId);
    onSessionStarted(session);
  });

  const handleCompleteSession = () => run('complete-session', async () => {
    // apiCompleteSession tallies summary, marks attendance, and broadcasts
    // the session_complete SSE event to all members.  We set the leader's
    // completion card immediately from the API response rather than waiting
    // for the SSE event, so the leader never misses it due to delivery timing.
    const response = await apiCompleteSession(userId, roomId);
    onSessionComplete(response.summary);
    setView('main');
  });

  const handleEndSession = () => run('end-session', async () => {
    await apiEndSession(userId, roomId, 'ended');
    onSessionEnded();
    setView('main');
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
  });

  const handlePrayerTime = () => run('prayer', async () => {
    await apiChangeMode(userId, roomId, 'prayer', leaderName);
  });

  const handleAskEmmausTogether = () => {
    onClose();
    onOpenAskEmmaus?.();
  };

  // ── Scripture picker ───────────────────────────────────────────────────────

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

  // ── Video ──────────────────────────────────────────────────────────────────

  const handleGatherTogether = () => {
    onOpenVideo?.();
    onClose();
  };

  const handleEndGathering = () => {
    onEndVideo?.();
    onClose();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[480px] mx-auto">
        <div className="bg-card rounded-t-3xl border border-border/60 shadow-2xl">
          {/* Handle + header */}
          <div className="pt-3 pb-1 flex flex-col items-center">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-4" />
          </div>

          {/* ── Main view ──────────────────────────────────────────────── */}
          {view === 'main' && (
            <div className="pb-safe-or-6 pb-6">

              {/* Session stage plan strip */}
              {sessionActive && (
                <div className="px-4 pb-2 overflow-x-auto">
                  <div className="flex items-center gap-1 min-w-max">
                    {SESSION_STAGES.map((stage, i) => {
                      const isCurrent = activeSession?.currentMode === stage.mode && stage.mode !== null;
                      return (
                        <div key={stage.id} className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              if (stage.mode) {
                                void run(stage.id, () => apiChangeMode(userId, roomId, stage.mode!, leaderName));
                              } else if (stage.id === 'scripture') {
                                setView('scripture');
                              } else if (stage.id === 'complete') {
                                setView('complete-confirm');
                              }
                            }}
                            disabled={busy === stage.id}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap disabled:opacity-50 ${
                              isCurrent
                                ? 'bg-primary text-primary-foreground'
                                : stage.id === 'complete'
                                ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            {stage.label}
                          </button>
                          {i < SESSION_STAGES.length - 1 && (
                            <span className="text-muted-foreground/30 text-[11px] select-none">›</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="px-5 pb-3 flex items-center justify-between">
                <div>
                  <p className="text-[17px] font-bold text-foreground">Guide Group</p>
                  {sessionActive ? (
                    <p className="text-[12px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                      ● Session active
                    </p>
                  ) : (
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      No active session
                    </p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Start session CTA */}
              {!sessionActive && (
                <div className="px-5 pb-3">
                  <button
                    onClick={handleStartSession}
                    disabled={busy === 'start-session'}
                    className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {busy === 'start-session'
                      ? <Loader2 size={17} className="animate-spin" />
                      : <MapPin size={17} />}
                    Start Session
                  </button>
                </div>
              )}

              {/* Actions grid */}
              <div className="px-4 grid grid-cols-2 gap-2.5 pb-3">
                <LeaderAction
                  icon={<BookOpen size={19} />}
                  label="Open Today's Step"
                  loading={busy === 'open-step'}
                  disabled={!sessionActive}
                  onClick={handleOpenTodaysStep}
                />
                <LeaderAction
                  icon={<ChevronRight size={19} className="-rotate-180" />}
                  label="Open Scripture"
                  loading={false}
                  disabled={!sessionActive}
                  onClick={() => setView('scripture')}
                />
                <LeaderAction
                  icon={<ArrowLeft size={19} />}
                  label="Previous Step"
                  loading={busy === 'prev-step'}
                  disabled={!sessionActive}
                  onClick={handlePreviousStep}
                />
                <LeaderAction
                  icon={<ArrowRight size={19} />}
                  label="Next Step"
                  loading={busy === 'next-step'}
                  disabled={!sessionActive}
                  onClick={handleNextStep}
                />
                <LeaderAction
                  icon={<MessageSquare size={19} />}
                  label="Start Discussion"
                  loading={busy === 'discussion'}
                  disabled={!sessionActive}
                  onClick={handleStartDiscussion}
                />
                <LeaderAction
                  icon={<HandHeart size={19} />}
                  label="Prayer Time"
                  loading={busy === 'prayer'}
                  disabled={!sessionActive}
                  onClick={handlePrayerTime}
                />
                <LeaderAction
                  icon={<BarChart2 size={19} />}
                  label="Launch Poll"
                  loading={false}
                  disabled={!sessionActive}
                  onClick={() => setView('poll-setup')}
                />
                <LeaderAction
                  icon={<Sparkles size={19} />}
                  label="Ask Emmaus Together"
                  loading={busy === 'ask-emmaus'}
                  disabled={!sessionActive}
                  onClick={handleAskEmmausTogether}
                />
                <LeaderAction
                  icon={<Video size={19} />}
                  label={videoActive ? 'End Gathering' : 'Gather Together'}
                  loading={false}
                  disabled={false}
                  onClick={videoActive ? handleEndGathering : handleGatherTogether}
                  variant={videoActive ? 'destructive' : 'default'}
                />
                <LeaderAction
                  icon={<CheckCircle2 size={19} />}
                  label="Complete Session"
                  loading={busy === 'complete-session'}
                  disabled={!sessionActive}
                  onClick={() => setView('complete-confirm')}
                  variant="success"
                />
              </div>

              {/* End session (subtle) */}
              {sessionActive && (
                <div className="px-5 pb-2">
                  <button
                    onClick={handleEndSession}
                    disabled={busy === 'end-session'}
                    className="w-full py-2.5 rounded-xl text-[13px] text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {busy === 'end-session'
                      ? <Loader2 size={14} className="animate-spin" />
                      : <StopCircle size={14} />}
                    End Session Without Completing
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Scripture picker ────────────────────────────────────────── */}
          {view === 'scripture' && (
            <div className="px-5 pb-safe-or-6 pb-8 space-y-4">
              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={() => setView('main')}
                  className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <ArrowLeft size={20} />
                </button>
                <p className="text-[17px] font-bold text-foreground">Open Scripture</p>
              </div>

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

          {/* ── Poll setup ──────────────────────────────────────────────── */}
          {view === 'poll-setup' && (
            <div className="px-5 pb-safe-or-6 pb-8 space-y-4">
              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={() => setView('main')}
                  className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <ArrowLeft size={20} />
                </button>
                <p className="text-[17px] font-bold text-foreground">Launch Poll</p>
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-widest block mb-2">Question</label>
                <textarea
                  value={poll.question}
                  onChange={e => setPoll(p => ({ ...p, question: e.target.value }))}
                  placeholder="e.g. What stood out most to you?"
                  rows={2}
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

          {/* ── Session complete confirm ─────────────────────────────────── */}
          {view === 'complete-confirm' && (
            <div className="px-5 pb-safe-or-6 pb-8 space-y-5">
              <div className="flex items-center gap-2 pb-1">
                <button
                  onClick={() => setView('main')}
                  className="p-2 text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <ArrowLeft size={20} />
                </button>
                <p className="text-[17px] font-bold text-foreground">Complete Session</p>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 space-y-3">
                <p className="text-[16px] font-bold text-emerald-800 dark:text-emerald-300">
                  Session Complete
                </p>
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
      </div>
    </>
  );
}

// ─── LeaderAction tile ────────────────────────────────────────────────────────

interface LeaderActionProps {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  variant?: 'default' | 'destructive' | 'success';
}

function LeaderAction({ icon, label, loading, disabled, onClick, variant = 'default' }: LeaderActionProps) {
  const colorCls =
    variant === 'destructive'
      ? 'text-destructive border-destructive/30 hover:bg-destructive/5'
      : variant === 'success'
      ? 'text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
      : 'text-foreground border-border hover:bg-muted/50';

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border min-h-[88px] transition-all disabled:opacity-40 disabled:pointer-events-none ${colorCls}`}
    >
      {loading ? <Loader2 size={19} className="animate-spin" /> : icon}
      <span className="text-[12px] font-medium text-center leading-tight">{label}</span>
    </button>
  );
}
