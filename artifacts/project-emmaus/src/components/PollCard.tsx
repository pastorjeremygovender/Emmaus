/**
 * PollCard.tsx — Room Poll bottom sheet.
 *
 * Auto-shown when a `poll_started` SSE event arrives (when followLeader ON).
 * Members vote once; leader sees live counts and reveals results.
 * SSE updates flow in from RoomDetail via props.
 */

import { useState } from 'react';
import { X, BarChart2, Loader2, CheckCircle2 } from 'lucide-react';
import { apiCastVote, apiRevealPoll } from '@/lib/rooms-api';
import type { RoomPoll } from '@/lib/rooms-types';

interface PollCardProps {
  roomId: string;
  userId: string;
  poll: RoomPoll;
  isLeader: boolean;
  /** Counts from SSE poll_vote_count events — updated in real-time. */
  pollVoteUpdate: { pollId: string; voteCounts: number[]; totalVotes: number } | null;
  /** Set when the leader reveals results via poll_revealed SSE event. */
  pollRevealUpdate: {
    pollId: string;
    voteCounts: number[];
    totalVotes: number;
    options: string[];
    question: string;
  } | null;
  /**
   * Hydrated initial results from GET /session/poll — used to restore state
   * for members who join/reconnect after the poll was started.
   */
  initialResults?: {
    voteCounts: number[];
    totalVotes: number;
    userVotedIndex: number | null;
  };
  onClose: () => void;
}

// Simple horizontal bar for results display
function ResultBar({
  label,
  count,
  total,
  isUserVote,
}: {
  label: string;
  count: number;
  total: number;
  isUserVote: boolean;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {isUserVote && (
            <CheckCircle2 size={13} className="text-primary shrink-0" />
          )}
          <span
            className={`text-[13px] font-medium truncate ${
              isUserVote ? 'text-primary' : 'text-foreground'
            }`}
          >
            {label}
          </span>
        </div>
        <span className="text-[12px] text-muted-foreground shrink-0 ml-2 tabular-nums">
          {pct}% ({count})
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isUserVote ? 'bg-primary' : 'bg-muted-foreground/40'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PollCard({
  roomId,
  userId,
  poll,
  isLeader,
  pollVoteUpdate,
  pollRevealUpdate,
  initialResults,
  onClose,
}: PollCardProps) {
  // Seed user vote from hydrated results so reconnectors see their previous vote
  const [userVotedIndex, setUserVotedIndex] = useState<number | null>(
    initialResults?.userVotedIndex ?? null
  );
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState('');
  // Leader reveal state
  const [revealing, setRevealing] = useState(false);

  // Compute live vote counts — prefer SSE update if pollId matches,
  // then hydrated initial results, then zeros
  const liveCounts: number[] =
    pollVoteUpdate?.pollId === poll.id
      ? pollVoteUpdate.voteCounts
      : (initialResults?.voteCounts ?? poll.options.map(() => 0));
  const liveTotalVotes =
    pollVoteUpdate?.pollId === poll.id
      ? pollVoteUpdate.totalVotes
      : (initialResults?.totalVotes ?? 0);

  // Is this poll revealed?
  const isRevealed =
    poll.resultsRevealed ||
    (pollRevealUpdate?.pollId === poll.id);

  const revealCounts: number[] =
    pollRevealUpdate?.pollId === poll.id
      ? pollRevealUpdate.voteCounts
      : liveCounts;
  const revealTotal =
    pollRevealUpdate?.pollId === poll.id
      ? pollRevealUpdate.totalVotes
      : liveTotalVotes;

  const handleVote = async (optionIndex: number) => {
    if (voting || userVotedIndex !== null) return;
    setVoting(true);
    setVoteError('');
    try {
      await apiCastVote(userId, roomId, poll.id, optionIndex);
      setUserVotedIndex(optionIndex);
    } catch {
      setVoteError('Failed to record your vote. Please try again.');
    } finally {
      setVoting(false);
    }
  };

  const handleReveal = async () => {
    if (revealing) return;
    setRevealing(true);
    try {
      await apiRevealPoll(userId, roomId, poll.id);
    } catch {
      alert('Failed to reveal results. Please try again.');
    } finally {
      setRevealing(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={isLeader ? onClose : undefined}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[480px] mx-auto">
        <div className="bg-card rounded-t-3xl border border-border/60 shadow-2xl max-h-[85dvh] overflow-y-auto pb-page-safe">
          {/* Handle */}
          <div className="pt-3 flex flex-col items-center">
            <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center">
                <BarChart2 size={16} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold text-foreground">Group Poll</p>
                  {isLeader && !isRevealed && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                      Live {liveTotalVotes > 0 ? `· ${liveTotalVotes}` : ''}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isRevealed ? 'Results revealed to the group' : 'Members are voting…'}
                </p>
              </div>
            </div>
            {isLeader && (
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close poll"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Question */}
          <div className="px-5 pt-1 pb-4">
            <p className="text-[17px] font-semibold text-foreground leading-snug">
              {poll.question}
            </p>
          </div>

          <div className="px-5 pb-safe-or-6 pb-6 space-y-3">
            {/* ── Results revealed ─────────────────────────────────────────── */}
            {isRevealed ? (
              <div className="space-y-3">
                <div className="space-y-2.5">
                  {poll.options.map((option, i) => (
                    <ResultBar
                      key={i}
                      label={option}
                      count={revealCounts[i] ?? 0}
                      total={revealTotal}
                      isUserVote={userVotedIndex === i}
                    />
                  ))}
                </div>
                <p className="text-[12px] text-muted-foreground text-center">
                  {revealTotal} {revealTotal === 1 ? 'response' : 'responses'}
                </p>
                {isLeader && (
                  <button
                    onClick={onClose}
                    className="w-full py-3 rounded-2xl border border-border text-muted-foreground text-[14px] font-medium hover:text-foreground transition-colors"
                  >
                    Close
                  </button>
                )}
              </div>
            ) : isLeader ? (
              /* ── Leader view: live counts + Reveal button ─────────────────── */
              <div className="space-y-3">
                <div className="space-y-2.5">
                  {poll.options.map((option, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-4 py-3 rounded-xl border border-border bg-muted/20"
                    >
                      <span className="text-[14px] font-medium text-foreground">{option}</span>
                      <span className="text-[13px] font-bold text-primary tabular-nums">
                        {liveCounts[i] ?? 0}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-muted-foreground text-center">
                  {liveTotalVotes} {liveTotalVotes === 1 ? 'response' : 'responses'} so far
                </p>
                <button
                  onClick={handleReveal}
                  disabled={revealing || liveTotalVotes === 0}
                  className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                >
                  {revealing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <BarChart2 size={16} />
                  )}
                  Reveal Results
                </button>
              </div>
            ) : userVotedIndex !== null ? (
              /* ── Member voted: waiting for results ───────────────────────── */
              <div className="space-y-3">
                <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-primary/8 border border-primary/20">
                  <CheckCircle2 size={18} className="text-primary shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-primary">Vote recorded</p>
                    <p className="text-[12px] text-muted-foreground">
                      You voted: {poll.options[userVotedIndex]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-2 py-3 text-[13px] text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" />
                  Waiting for the leader to reveal results…
                </div>
              </div>
            ) : (
              /* ── Member: vote buttons ─────────────────────────────────────── */
              <div className="space-y-2.5">
                {voteError && (
                  <p className="text-[12px] text-red-500 text-center">{voteError}</p>
                )}
                {poll.options.map((option, i) => (
                  <button
                    key={i}
                    onClick={() => handleVote(i)}
                    disabled={voting}
                    className="w-full py-3.5 rounded-2xl border border-border bg-card text-[14px] font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {voting ? <Loader2 size={15} className="animate-spin" /> : null}
                    {option}
                  </button>
                ))}
                <p className="text-[11px] text-muted-foreground text-center">
                  Your response is anonymous
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
