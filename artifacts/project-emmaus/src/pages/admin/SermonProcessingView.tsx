/**
 * SermonProcessingView — shows the background pipeline progress for a sermon.
 *
 * Polls GET /api/sermons/admin/:id every 3 s while the pipeline is active and
 * advances the stage indicators. Calls onComplete when processingStage reaches
 * 'complete'. Calls onRetry (which re-calls the /process endpoint) when the
 * admin clicks Retry after a failure.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { getAdminSermon } from '@/lib/canonical-sermon-api';

// ─── Stage definitions ────────────────────────────────────────────────────────

interface StageDef {
  key: string;
  label: string;
  /** processingStage values that show this row as the active/running step */
  activeIn: string[];
  /** processingStage values where this row is already done */
  doneWhen: string[];
  /** processingStage prefix that marks this step as failed */
  failsAt?: string;
}

const STAGES: StageDef[] = [
  {
    key: 'upload',
    label: 'Audio uploaded',
    activeIn: [],
    doneWhen: ['transcribing', 'generating', 'complete'],
    failsAt: undefined,
  },
  {
    key: 'transcribe',
    label: 'Transcribing sermon audio',
    activeIn: ['transcribing'],
    doneWhen: ['generating', 'complete'],
    failsAt: 'failed:transcribing',
  },
  {
    key: 'detect',
    label: 'Identifying sermon section and themes',
    activeIn: ['generating'],
    doneWhen: ['complete'],
    failsAt: 'failed:generating',
  },
  {
    key: 'draft',
    label: 'Generating summary and keywords',
    activeIn: ['generating'],
    doneWhen: ['complete'],
    failsAt: 'failed:generating',
  },
  {
    key: 'companion',
    label: 'Creating 5-Day Companion',
    activeIn: ['generating'],
    doneWhen: ['complete'],
    failsAt: 'failed:generating',
  },
  {
    key: 'ready',
    label: 'Ready for review',
    activeIn: [],
    doneWhen: ['complete'],
    failsAt: undefined,
  },
];

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
  const [stage, setStage]   = useState(initialStage);
  const [error, setError]   = useState('');
  const [retrying, setRetrying] = useState(false);

  const isFailed   = stage.startsWith('failed:');
  const isComplete = stage === 'complete';

  // ── Polling ──────────────────────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const sermon = await getAdminSermon(sermonId);
      const s = sermon.processingStage ?? 'idle';
      setStage(prev => {
        if (s !== prev) return s;
        return prev;
      });
      if (s === 'complete') {
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
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [isComplete, isFailed, poll]);

  // Set initial error from server if we opened on a failed state
  useEffect(() => {
    if (!isFailed || error) return;
    getAdminSermon(sermonId).then(s => {
      if (s.processingError) setError(s.processingError);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    setError('');
    try {
      await onRetry();
      setStage('transcribing');
    } finally {
      setRetrying(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] py-12 px-6">
      <div className="w-full max-w-sm">

        <h2 className="text-[17px] font-semibold text-gray-900 mb-1.5 text-center">
          {isFailed ? 'Processing stopped' : 'Processing sermon…'}
        </h2>

        <p className="text-sm text-gray-500 text-center mb-8 leading-relaxed">
          {isFailed
            ? 'One stage failed. Review the error below and retry.'
            : 'This takes 2–4 minutes. You can leave the page — the sermon will be ready when you return.'}
        </p>

        {/* Stage list */}
        <div className="space-y-2.5">
          {STAGES.map(s => {
            const isDone    = s.doneWhen.some(v => stage === v || stage.startsWith(v));
            const isActive  = s.activeIn.includes(stage);
            const isStageFailed = s.failsAt ? stage === s.failsAt : false;

            let icon: React.ReactNode;
            if (isStageFailed) {
              icon = <AlertCircle size={17} className="text-red-500" />;
            } else if (isDone) {
              icon = <CheckCircle2 size={17} className="text-teal-500" />;
            } else if (isActive) {
              icon = <Loader2 size={17} className="animate-spin text-teal-600" />;
            } else {
              icon = <Clock size={17} className="text-gray-300" />;
            }

            return (
              <div
                key={s.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                  isStageFailed ? 'bg-red-50 border border-red-100'
                  : isActive     ? 'bg-teal-50 border border-teal-100'
                  : isDone       ? 'bg-gray-50 border border-transparent'
                  : 'bg-white border border-transparent'
                }`}
              >
                <span className="shrink-0">{icon}</span>
                <span className={`text-sm ${
                  isStageFailed ? 'text-red-700 font-medium'
                  : isActive     ? 'text-teal-700 font-medium'
                  : isDone       ? 'text-gray-700'
                  : 'text-gray-400'
                }`}>
                  {s.label}
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
