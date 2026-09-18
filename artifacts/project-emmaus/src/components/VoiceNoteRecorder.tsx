/**
 * VoiceNoteRecorder.tsx
 *
 * Inline voice-note recording for Group Discussion.
 * - Tap mic → recording starts (red pulsing dot + timer)
 * - Tap stop → recording stops, blob is uploaded, attachment returned to parent
 * - Falls back gracefully when MediaRecorder is unavailable (parent handles fallback)
 *
 * MIME handling:
 *   pickMimeType()   — hint to MediaRecorder (may be overridden by the browser)
 *   mr.mimeType      — the format the recorder *actually* used (read in onstop)
 *   baseMimeType()   — strips ";codecs=…" for the server allowlist and GCS header
 *   The blob and File are always typed with the actual base MIME, not the hint.
 */

import { useEffect, useRef, useState } from 'react';
import { Square, X, Loader2 } from 'lucide-react';
import { apiRequestRoomUploadUrl, uploadFileToStorage } from '@/lib/rooms-api-media';
import type { MediaAttachment } from '@/lib/rooms-types';

/** Maximum recording duration (5 minutes). */
const MAX_DURATION_MS = 5 * 60 * 1_000;

/**
 * Preferred MIME types offered to MediaRecorder as a construction hint.
 * The browser may still pick a different format; always read mr.mimeType
 * after construction to know what was actually selected.
 */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
];

/** Return the first supported hint, or '' to let the browser decide. */
function pickMimeHint(): string {
  for (const mt of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return '';
}

/**
 * Strip codec parameters (e.g. "audio/webm;codecs=opus" → "audio/webm").
 * The server allowlist and GCS Content-Type header require bare MIME types.
 */
function baseMimeType(mime: string): string {
  return mime.split(';')[0].trim();
}

/** Map a base MIME type to a file extension. Falls back to 'webm'. */
function mimeToExtension(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'webm';
  if (mime.startsWith('audio/ogg')) return 'ogg';
  if (mime.startsWith('audio/mp4')) return 'mp4';
  if (mime.startsWith('audio/mpeg')) return 'mp3';
  return 'webm';
}

/**
 * Server-allowed audio MIME types (mirrors ALLOWED_MEDIA in the API).
 * Returns the bare base type if allowed, or null when the format is unknown.
 * Callers must treat null as an unrecoverable error (show a message, do not upload).
 */
const SERVER_ALLOWED_AUDIO = new Set([
  'audio/mpeg', 'audio/mp4', 'audio/webm',
  'audio/ogg',  'audio/wav', 'audio/aac', 'audio/x-m4a',
]);

function resolveServerMime(actualRecordedMime: string): string | null {
  const base = baseMimeType(actualRecordedMime);
  return SERVER_ALLOWED_AUDIO.has(base) ? base : null;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface VoiceNoteRecorderProps {
  userId: string;
  roomId: string;
  /** Called when the upload is complete and the attachment is ready to send. */
  onAttachment: (attachment: MediaAttachment) => void;
  /** Called when the user cancels recording without sending. */
  onCancel: () => void;
}

type RecorderState = 'recording' | 'uploading' | 'error';

export function VoiceNoteRecorder({ userId, roomId, onAttachment, onCancel }: VoiceNoteRecorderProps) {
  const [recorderState, setRecorderState] = useState<RecorderState>('recording');
  const [elapsed, setElapsed] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Set to true before any cancel or unmount-triggered stop so the onstop
   * callback skips upload. Never set it false again after true.
   */
  const discardedRef = useRef(false);

  // Start recording as soon as the component mounts.
  useEffect(() => {
    let cancelled = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;

        const hint = pickMimeHint();
        const mr = new MediaRecorder(stream, hint ? { mimeType: hint } : undefined);
        mediaRecorderRef.current = mr;
        chunksRef.current = [];

        mr.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        mr.onstop = async () => {
          stopTimer();
          // Cancel / unmount path: discard silently, no upload.
          if (discardedRef.current) return;

          // Read the format the recorder *actually* used — not the hint we passed.
          // mr.mimeType is authoritative; fall back to the first chunk's type when empty.
          const actualMime =
            mr.mimeType ||
            (chunksRef.current[0] instanceof Blob ? (chunksRef.current[0] as Blob).type : '') ||
            '';

          // Build the blob typed with the actual MIME so the browser plays it correctly.
          const blob = new Blob(chunksRef.current, { type: actualMime || undefined });
          await uploadRecording(blob, actualMime);
        };

        mr.start(250); // collect data every 250 ms

        // Elapsed timer
        timerRef.current = setInterval(() => {
          setElapsed(prev => prev + 1);
        }, 1_000);

        // Safety stop at MAX_DURATION_MS
        maxTimerRef.current = setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }, MAX_DURATION_MS);
      } catch (err) {
        if (!cancelled) {
          setRecorderState('error');
          setErrorMsg(
            err instanceof Error && err.name === 'NotAllowedError'
              ? 'Microphone permission denied.'
              : 'Could not access the microphone.',
          );
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
  }

  function cleanup() {
    stopTimer();
    // Mark as discarded BEFORE stopping so onstop skips the upload.
    discardedRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  /** Deliberate "stop & send" — discardedRef stays false so onstop uploads. */
  const handleStop = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  /** Cancel — cleanup() sets discardedRef true before stopping. */
  const handleCancel = () => {
    cleanup();
    onCancel();
  };

  /**
   * Upload the recorded blob.
   *
   * @param blob         The recorded audio blob (typed with the actual MIME).
   * @param recordedMime The MIME string reported by mr.mimeType (may include codecs).
   */
  async function uploadRecording(blob: Blob, recordedMime: string) {
    setRecorderState('uploading');
    setUploadProgress(0);

    // Derive the bare type the server accepts (strips codec params).
    // If the actual recorded format isn't on the server allowlist, reject with an error
    // rather than relabelling bytes as a different container format.
    const serverMime = resolveServerMime(recordedMime);
    if (!serverMime) {
      setRecorderState('error');
      setErrorMsg(`Your browser recorded in an unsupported format (${baseMimeType(recordedMime) || 'unknown'}). Please use the file upload option instead.`);
      return;
    }
    const ext = mimeToExtension(serverMime);
    const filename = `voice-note-${Date.now()}.${ext}`;

    try {
      // File uses the server-allowed bare MIME so GCS receives a valid Content-Type.
      const file = new File([blob], filename, { type: serverMime });

      const { uploadUrl, objectPath, attachmentType } = await apiRequestRoomUploadUrl(
        userId, roomId, filename, serverMime, file.size,
      );
      await uploadFileToStorage(uploadUrl, file, setUploadProgress);

      const attachment: MediaAttachment = {
        type: (attachmentType as MediaAttachment['type']) || 'voice',
        filename,
        objectPath,
        mimeType: serverMime,
        size: file.size,
      };
      onAttachment(attachment);
    } catch (err) {
      setRecorderState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (recorderState === 'error') {
    return (
      <div className="flex items-center gap-3 px-1 py-1 w-full">
        <p className="flex-1 text-[13px] text-destructive">{errorMsg}</p>
        <button
          onClick={handleCancel}
          className="text-muted-foreground hover:text-foreground p-2"
          aria-label="Dismiss"
        >
          <X size={18} />
        </button>
      </div>
    );
  }

  if (recorderState === 'uploading') {
    return (
      <div className="flex items-center gap-3 px-1 py-1 w-full">
        <Loader2 size={18} className="animate-spin text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-[13px] font-medium text-foreground">Uploading… {uploadProgress}%</p>
          <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // recording state
  return (
    <div className="flex items-center gap-3 px-1 py-1 w-full">
      {/* Pulsing red dot */}
      <span className="relative flex h-3 w-3 shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
      </span>

      {/* Timer */}
      <span className="flex-1 font-mono text-[15px] font-semibold text-foreground tabular-nums">
        {formatDuration(elapsed)}
      </span>

      {/* Cancel */}
      <button
        onClick={handleCancel}
        className="w-9 h-9 rounded-full border border-border bg-muted text-muted-foreground flex items-center justify-center hover:text-foreground transition-colors"
        aria-label="Cancel recording"
      >
        <X size={16} />
      </button>

      {/* Stop & send */}
      <button
        onClick={handleStop}
        className="w-10 h-10 rounded-full bg-destructive text-white flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity"
        aria-label="Stop recording"
      >
        <Square size={14} fill="currentColor" />
      </button>
    </div>
  );
}

/** Returns true if the current browser supports MediaRecorder for audio. */
export function supportsMediaRecorder(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}
