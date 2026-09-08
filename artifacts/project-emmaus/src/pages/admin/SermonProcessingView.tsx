/**
 * SermonProcessingView — shows live background pipeline progress for a sermon.
 *
 * Polls GET /api/sermons/admin/:id every 3 s while the pipeline is active.
 * Calls onComplete when processingStage reaches 'complete'.
 * Calls onRetry (which re-calls the /process endpoint) when the admin clicks Retry.
 *
 * ── Stage model ──────────────────────────────────────────────────────────────
 * The server emits these processingStage values in order:
 *
 *   preparing          — downloading from object storage
 *   compressing        — ffmpeg compress running          [optional: large files only]
 *   chunking:N         — splitting into N segments        [optional: very large files only]
 *   transcribing:i:N   — sending chunk i of N to Whisper  (or "transcribing:1:1" = single call)
 *   combining          — joining chunk transcripts        [optional: chunked path only]
 *   detecting          — AI sermon-section detection
 *   drafting           — AI sermon draft + keywords
 *   companion          — AI 5-day companion
 *   complete           — done
 *
 * Legacy value 'generating' (from old pipeline) maps to the same rank as 'detecting'.
 * Legacy value 'transcribing' (bare, from old pipeline) maps to the same rank as 'transcribing:1:1'.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { getAdminSermon } from '@/lib/canonical-sermon-api';

// ─── Stage rank ───────────────────────────────────────────────────────────────

/**
 * Assigns a numeric rank to every stage value so we can determine
 * done / active / pending for each display row.
 */
function stageRank(stage: string): number {
  if (!stage || stage === 'idle') return 0;
  if (stage === 'preparing')                                    return 1;
  if (stage === 'compressing')                                  return 2;
  if (stage.startsWith('chunking:'))                           return 3;
  if (stage.startsWith('transcribing:') || stage === 'transcribing') return 4;
  if (stage === 'combining')                                    return 5;
  if (stage === 'detecting' || stage === 'generating')          return 6;
  if (stage === 'drafting')                                     return 7;
  if (stage === 'companion')                                    return 8;
  if (stage === 'complete' || stage === 'READY_FOR_REVIEW')     return 10;
  return 0;
}

/**
 * Extracts the base key for seenStages tracking and row matching.
 * e.g. "transcribing:3:6" → "transcribing", "chunking:6" → "chunking",
 * "generating" → "detecting" (legacy alias).
 */
function stageBaseKey(stage: string): string {
  if (stage.startsWith('chunking:'))    return 'chunking';
  if (stage.startsWith('transcribing:')) return 'transcribing';
  if (stage === 'generating')            return 'detecting';
  return stage;
}

// ─── Row definitions ──────────────────────────────────────────────────────────

interface RowDef {
  key: string;
  rank: number;
  /**
   * Mandatory rows are always shown when the pipeline has reached or passed
   * their rank. Optional rows only appear if the server explicitly emitted
   * that stage (tracked in seenStages).
   */
  mandatory: boolean;
  /** processingStage prefix that marks this row as failed */
  failPrefix?: string;
}

const ROW_DEFS: RowDef[] = [
  { key: 'upload',       rank: 0,  mandatory: true  },
  { key: 'preparing',    rank: 1,  mandatory: true  },
  { key: 'compressing',  rank: 2,  mandatory: false },
  { key: 'chunking',     rank: 3,  mandatory: false },
  { key: 'transcribing', rank: 4,  mandatory: true,  failPrefix: 'failed:transcribing' },
  { key: 'combining',    rank: 5,  mandatory: false },
  // Each generation sub-stage has its own failPrefix so only the row that
  // actually failed is shown red; later rows show "Waiting — previous stage failed".
  // Legacy fallback: 'failed:generating' (old DB rows) is treated as failed:detecting.
  { key: 'detecting',    rank: 6,  mandatory: true,  failPrefix: 'failed:detecting' },
  { key: 'drafting',     rank: 7,  mandatory: true,  failPrefix: 'failed:drafting' },
  { key: 'companion',    rank: 8,  mandatory: true,  failPrefix: 'failed:companion' },
  { key: 'ready',        rank: 10, mandatory: true  },
];

// ─── Dynamic label ────────────────────────────────────────────────────────────

function rowLabel(key: string, currentStage: string): string {
  switch (key) {
    case 'upload':       return 'Audio uploaded';
    case 'preparing':    return 'Preparing audio';
    case 'compressing':  return 'Compressing audio';
    case 'chunking': {
      if (currentStage.startsWith('chunking:')) {
        const n = currentStage.split(':')[1];
        if (n && n !== '?') return `Splitting into ${n} parts`;
      }
      return 'Splitting into parts';
    }
    case 'transcribing': {
      if (currentStage.startsWith('transcribing:')) {
        const [, i, total] = currentStage.split(':');
        if (total && total !== '1') return `Transcribing part ${i} of ${total}`;
      }
      return 'Transcribing sermon audio';
    }
    case 'combining':    return 'Combining transcript';
    case 'detecting':    return 'Identifying sermon sections and themes';
    case 'drafting':     return 'Generating summary and keywords';
    case 'companion':    return 'Creating 5-Day Companion';
    case 'ready':        return 'Ready for review';
    default:             return key;
  }
}

// ─── seenStages inference ─────────────────────────────────────────────────────

/**
 * Initialises the set of stages known to have been visited, given a starting
 * processingStage value (which may be mid-pipeline if the user navigated away
 * and came back).
 *
 * Mandatory rows with rank ≤ current rank are inferred as seen.
 * Optional rows are only added when explicitly observed during this session
 * (via updateSeenStages), except when they can be firmly inferred:
 *   - "transcribing:N:X" with X > 1 → compressing + chunking must have run.
 *   - "combining" → compressing + chunking must have run.
 */
function inferSeenStages(stage: string): Set<string> {
  const seen = new Set<string>(['upload']);
  const rank = stageRank(stage);

  // Add all mandatory rows at or below the current rank
  for (const row of ROW_DEFS) {
    if (row.mandatory && row.rank <= rank) seen.add(row.key);
  }

  // Add the current stage's base key
  seen.add(stageBaseKey(stage));

  // Firm inference: if we're transcribing multiple chunks, compression + chunking ran
  if (stage.startsWith('transcribing:')) {
    const total = parseInt(stage.split(':')[2] ?? '1', 10);
    if (total > 1) { seen.add('compressing'); seen.add('chunking'); }
  }
  if (stage === 'combining') {
    seen.add('compressing'); seen.add('chunking');
  }

  return seen;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  sermonId: string;
  initialStage: string;
  onComplete: () => void;
  onRetry: () => void;
}

export default function SermonProcessingView({
  sermonId,
  initialStage,
  onComplete,
  onRetry,
}: Props) {
  const [stage, setStage]         = useState(initialStage);
  const [error, setError]         = useState('');
  const [retrying, setRetrying]   = useState(false);
  // Accumulates all stage keys observed so optional rows become visible
  const [seenStages, setSeenStages] = useState<Set<string>>(() => inferSeenStages(initialStage));
  // Keep a stable ref so the poll callback never captures a stale value
  const stageRef = useRef(stage);
  stageRef.current = stage;

  const isFailed   = stage.startsWith('failed:');
  const isComplete = stage === 'complete' || stage === 'READY_FOR_REVIEW';

  // ── Polling ───────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const sermon = await getAdminSermon(sermonId);
      const s = sermon.processingStage ?? 'idle';

      if (s !== stageRef.current) {
        setStage(s);
        setSeenStages(prev => {
          const next = new Set(prev);
          next.add(stageBaseKey(s));
          // Same firm inferences when new stage arrives
          if (s.startsWith('transcribing:')) {
            const total = parseInt(s.split(':')[2] ?? '1', 10);
            if (total > 1) { next.add('compressing'); next.add('chunking'); }
          }
          if (s === 'combining') { next.add('compressing'); next.add('chunking'); }
          return next;
        });
      }

      if (s === 'complete' || s === 'READY_FOR_REVIEW') {
        onComplete();
      } else if (s.startsWith('failed:')) {
        setError(sermon.processingError || 'Processing stopped unexpectedly.');
      }
    } catch {
      // Non-fatal: keep polling
    }
  }, [sermonId, onComplete]);

  useEffect(() => {
    if (isComplete || isFailed) return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [isComplete, isFailed, poll]);

  // Load initial error if we opened on a failed state
  useEffect(() => {
    if (!isFailed || error) return;
    getAdminSermon(sermonId)
      .then(s => { if (s.processingError) setError(s.processingError); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    setError('');
    try {
      await onRetry();
      // If the failure was in a generation sub-stage (transcript was already complete),
      // reset the view to 'generating' so transcription rows remain green and the
      // admin can see the pipeline resuming from the correct point.
      // For transcription failures, reset all the way back to 'preparing'.
      const isGenerationFailure =
        stage === 'failed:detecting' ||
        stage === 'failed:drafting'  ||
        stage === 'failed:companion' ||
        stage === 'failed:generating'; // legacy alias
      const resetStage = isGenerationFailure ? 'generating' : 'preparing';
      setStage(resetStage);
      setSeenStages(inferSeenStages(resetStage));
    } finally {
      setRetrying(false);
    }
  };

  // ── Build display rows ────────────────────────────────────────────────────
  const currentRank = stageRank(stage);

  // Rank of the stage that actually failed (used to determine which rows come
  // *after* the failure and should show "Waiting — previous stage failed").
  // Legacy 'failed:generating' maps to rank 6 (detecting).
  const failedRank = isFailed
    ? stage === 'failed:generating'
      ? 6  // legacy alias → detecting rank
      : stageRank(stage.replace(/^failed:/, ''))
    : -1;

  const visibleRows = ROW_DEFS.filter(row =>
    row.mandatory || seenStages.has(row.key)
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] py-12 px-6">
      <div className="w-full max-w-sm">

        <h2 className="text-[17px] font-semibold text-gray-900 mb-1.5 text-center">
          {isFailed ? 'Processing stopped' : isComplete ? 'Done' : 'Processing sermon…'}
        </h2>

        <p className="text-sm text-gray-500 text-center mb-8 leading-relaxed">
          {isFailed
            ? 'One stage failed. Review the error below and retry.'
            : isComplete
              ? 'Your sermon is ready to review and publish.'
              : 'This takes 2–5 minutes. You can leave the page — the sermon will be ready when you return.'}
        </p>

        {/* Stage list */}
        <div className="space-y-2.5">
          {visibleRows.map(row => {
            const isActive = stageBaseKey(stage) === row.key && !isFailed;
            const isDone   = !isFailed && currentRank > row.rank;

            // A row is "failed" if it matches the exact stage that failed.
            // Legacy 'failed:generating' is treated as 'failed:detecting' — only the
            // detecting row shows red, not all downstream generation rows.
            const isStageFailed = isFailed && (
              (row.failPrefix ? stage.startsWith(row.failPrefix) : false) ||
              (stage === 'failed:generating' && row.key === 'detecting')
            );

            // Rows that come *after* the failed stage — they never ran.
            // Show "Waiting — previous stage failed" instead of a plain grey clock.
            const isWaitingAfterFailure =
              isFailed && !isDone && !isStageFailed && !isActive && row.rank > failedRank;

            const isPending = !isActive && !isDone && !isStageFailed && !isWaitingAfterFailure;

            let icon: React.ReactNode;
            if (isStageFailed) {
              icon = <AlertCircle size={17} className="text-red-500" />;
            } else if (isDone) {
              icon = <CheckCircle2 size={17} className="text-teal-500" />;
            } else if (isActive) {
              icon = <Loader2 size={17} className="animate-spin text-teal-600" />;
            } else if (isWaitingAfterFailure) {
              icon = <Clock size={17} className="text-amber-400" />;
            } else {
              icon = <Clock size={17} className={isPending ? 'text-gray-300' : 'text-teal-500'} />;
            }

            const label = isWaitingAfterFailure
              ? 'Waiting — previous stage failed'
              : rowLabel(row.key, stage);

            return (
              <div
                key={row.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isStageFailed          ? 'bg-red-50 border border-red-100'
                  : isActive             ? 'bg-teal-50 border border-teal-100'
                  : isDone               ? 'bg-gray-50 border border-transparent'
                  : isWaitingAfterFailure? 'bg-amber-50 border border-amber-100'
                  : 'bg-white border border-transparent'
                }`}
              >
                <span className="shrink-0">{icon}</span>
                <span className={`text-sm ${
                  isStageFailed           ? 'text-red-700 font-medium'
                  : isActive              ? 'text-teal-700 font-medium'
                  : isDone                ? 'text-gray-700'
                  : isWaitingAfterFailure ? 'text-amber-700'
                  : 'text-gray-400'
                }`}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Failure error + retry */}
        {isFailed && (
          <div className="mt-6 space-y-3">
            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3 border border-red-100 leading-relaxed">
                {error}
              </p>
            )}
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="w-full px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {retrying
                ? <><Loader2 size={14} className="animate-spin" /> Retrying…</>
                : 'Retry Processing'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
