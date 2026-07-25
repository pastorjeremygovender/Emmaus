/**
 * SermonAudioPlayer — in-app audio player for trimmed sermon recordings.
 *
 * Features:
 *   • HTML5 <audio> streaming from the API server audio route
 *   • Play / pause, ±15 s skip, seek bar, playback speed
 *   • Resume position persisted to localStorage per audio URL
 *   • Opens as a bottom sheet
 *   • "Watch on YouTube" fallback button when watchUrl is provided
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, ExternalLink, X,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getApiUrl } from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SermonAudioPlayerProps {
  open: boolean;
  onClose: () => void;
  /** Relative URL path from the API, e.g. /api/youtube-archive/audio/<id> */
  audioUrl: string;
  /** Position (seconds) in the trimmed audio to start from on first open */
  startSeconds?: number;
  title: string;
  speaker?: string;
  /** YouTube timestamped URL for the Watch button */
  watchUrl?: string;
}

// ─── Speed options ────────────────────────────────────────────────────────────

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

// ─── Component ────────────────────────────────────────────────────────────────

export function SermonAudioPlayer({
  open,
  onClose,
  audioUrl,
  startSeconds = 0,
  title,
  speaker,
  watchUrl,
}: SermonAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  const resumeKey = `emmaus_audio_pos_${audioUrl}`;
  const fullUrl = getApiUrl(audioUrl);

  // ── Restore position when sheet opens ───────────────────────────────────

  useEffect(() => {
    if (!open || !audioRef.current) return;
    if (initialised) return; // only on first open per mount

    const saved = parseFloat(localStorage.getItem(resumeKey) ?? 'NaN');
    if (!isNaN(saved) && saved > 0 && saved < (audioRef.current.duration || Infinity)) {
      audioRef.current.currentTime = saved;
      setCurrentTime(saved);
    } else if (startSeconds > 0) {
      audioRef.current.currentTime = startSeconds;
      setCurrentTime(startSeconds);
    }
    setInitialised(true);
  }, [open, resumeKey, startSeconds, initialised]);

  // ── Save position when closing / unmounting ──────────────────────────────

  const savePosition = useCallback(() => {
    if (audioRef.current && currentTime > 2) {
      localStorage.setItem(resumeKey, String(Math.round(currentTime)));
    }
  }, [resumeKey, currentTime]);

  useEffect(() => {
    if (!open) { savePosition(); }
  }, [open, savePosition]);

  useEffect(() => () => savePosition(), [savePosition]);

  // ── Audio event handlers ─────────────────────────────────────────────────

  function handleTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    setCurrentTime(a.currentTime);
  }

  function handleDurationChange() {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration || 0);
  }

  function handlePlay() { setPlaying(true); setBuffering(false); }
  function handlePause() { setPlaying(false); }
  function handleWaiting() { setBuffering(true); }
  function handleCanPlay() { setBuffering(false); }
  function handleError() {
    setError('Audio could not be loaded. The file may not be ready yet.');
    setPlaying(false);
    setBuffering(false);
  }

  // ── Controls ─────────────────────────────────────────────────────────────

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play().catch(() => {}); }
  }

  function skip(seconds: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + seconds));
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a) return;
    const t = parseFloat(e.target.value);
    a.currentTime = t;
    setCurrentTime(t);
  }

  function cycleSpeed() {
    const a = audioRef.current;
    if (!a) return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    a.playbackRate = next;
    setSpeed(next);
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-safe">
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={fullUrl}
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onPlay={handlePlay}
          onPause={handlePause}
          onWaiting={handleWaiting}
          onCanPlay={handleCanPlay}
          onError={handleError}
          onEnded={() => { setPlaying(false); }}
        />

        <SheetHeader className="pb-1">
          <SheetTitle className="text-left text-[15px] font-semibold leading-snug line-clamp-2">
            {title}
          </SheetTitle>
          {speaker && (
            <p className="text-[13px] text-muted-foreground -mt-1">{speaker}</p>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Error state */}
          {error && (
            <div className="rounded-lg bg-destructive/10 text-destructive text-[13px] p-3">
              {error}
            </div>
          )}

          {/* Seek bar */}
          <div className="space-y-1">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={currentTime}
              onChange={handleSeek}
              disabled={!duration}
              className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
              <span>{fmt(currentTime)}</span>
              <span>{duration > 0 ? fmt(duration) : '--:--'}</span>
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center justify-center gap-6">
            {/* −15s */}
            <button
              onClick={() => skip(-15)}
              className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Back 15 seconds"
            >
              <SkipBack size={22} />
              <span className="text-[10px]">15s</span>
            </button>

            {/* Play / Pause */}
            <button
              onClick={togglePlay}
              disabled={!!error}
              className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40"
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {buffering ? (
                <span className="w-5 h-5 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              ) : playing ? (
                <Pause size={24} fill="currentColor" />
              ) : (
                <Play size={24} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            {/* +15s */}
            <button
              onClick={() => skip(15)}
              className="flex flex-col items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Forward 15 seconds"
            >
              <SkipForward size={22} />
              <span className="text-[10px]">15s</span>
            </button>
          </div>

          {/* Speed + Watch buttons */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={cycleSpeed}
              className="text-[13px] font-medium text-muted-foreground hover:text-foreground bg-muted/60 px-3 py-1.5 rounded-full transition-colors"
              aria-label={`Playback speed: ${speed}×`}
            >
              {speed}×
            </button>

            {watchUrl && (
              <a
                href={watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={savePosition}
              >
                <ExternalLink size={14} />
                Watch on YouTube
              </a>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
