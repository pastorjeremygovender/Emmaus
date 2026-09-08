/**
 * SermonAudioUpload — Self-contained audio upload widget for the Sermon editor.
 *
 * Handles file selection, upload-URL request, direct-to-GCS PUT upload
 * with progress, success and error states, remove/replace, and transcription.
 *
 * Props:
 *   sermonId       — canonical sermon UUID (must exist before uploading)
 *   currentPath    — sermon.audioPath from parent ('' if none)
 *   transcriptStatus — sermon.transcriptStatus
 *   onAudioSaved   — called with the new objectPath after upload completes
 *   onTranscribed  — called with the full transcript text after transcription
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  Upload, FileAudio, X, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, Mic2,
} from 'lucide-react';
import { requestAudioUploadUrl, transcribeSermonAudio, getAdminSermon } from '@/lib/canonical-sermon-api';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const ACCEPTED_TYPES = '.mp3,.m4a,.wav,.mp4,.mpeg,.webm';
const ACCEPTED_MIMES = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
  'audio/wav', 'video/mp4', 'audio/webm', 'audio/ogg',
];

const MAX_MB = 250;
const MAX_BYTES = MAX_MB * 1024 * 1024;

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

type Phase = 'idle' | 'uploading' | 'uploaded' | 'transcribing' | 'transcribed' | 'error';

interface Props {
  sermonId: string | null;
  currentPath: string;
  transcriptStatus: 'none' | 'pending' | 'complete';
  onAudioSaved: (objectPath: string) => void;
  onTranscribed: (transcript: string) => void;
}

export default function SermonAudioUpload({
  sermonId,
  currentPath,
  transcriptStatus,
  onAudioSaved,
  onTranscribed,
}: Props) {
  const inputRef           = useRef<HTMLInputElement>(null);
  const [file, setFile]    = useState<File | null>(null);
  const [phase, setPhase]  = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError]  = useState('');
  const [dragOver, setDragOver] = useState(false);

  const hasExistingAudio = !!currentPath;

  const selectFile = useCallback((f: File) => {
    setError('');
    if (!ACCEPTED_MIMES.some(m => f.type === m) && !f.name.match(/\.(mp3|m4a|wav|mp4|mpeg|webm)$/i)) {
      setError('Unsupported file type. Please upload MP3, M4A, WAV, MP4, MPEG, or WEBM.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`The file exceeds the ${MAX_MB} MB maximum (${formatBytes(f.size)}).`);
      return;
    }
    setFile(f);
    setPhase('idle');
    setProgress(0);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) selectFile(f);
  }, [selectFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
    e.target.value = '';
  }, [selectFile]);

  const handleUpload = useCallback(async () => {
    if (!file || !sermonId) return;
    setPhase('uploading');
    setProgress(0);
    setError('');

    try {
      const { uploadURL, objectPath } = await requestAudioUploadUrl(sermonId, {
        name: file.name,
        size: file.size,
        contentType: file.type || 'audio/mpeg',
      });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadURL);
        xhr.setRequestHeader('Content-Type', file.type || 'audio/mpeg');
        xhr.upload.addEventListener('progress', e => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        });
        xhr.onload  = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`));
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      setProgress(100);
      setPhase('uploaded');
      onAudioSaved(objectPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed. Please try again.';
      // Map raw XHR/network errors to friendlier messages
      const friendly = msg.includes('413') || msg.includes('too large')
        ? `The file exceeds the ${MAX_MB} MB maximum.`
        : msg.includes('Network error') || msg.includes('interrupted')
          ? 'The upload was interrupted. Please try again.'
          : msg.includes('415') || msg.includes('format') || msg.includes('Unsupported')
            ? 'This file format is not supported.'
            : msg;
      setError(friendly);
      setPhase('error');
    }
  }, [file, sermonId, onAudioSaved]);

  const handleTranscribe = useCallback(async () => {
    if (!sermonId) return;
    setPhase('transcribing');
    setError('');
    try {
      // POST returns 202 immediately — transcription runs in the background.
      await transcribeSermonAudio(sermonId);

      // Poll GET /admin/:id until transcriptStatus leaves "pending".
      // Timeout after ~3 minutes (36 polls × 5 s).
      const MAX_POLLS = 36;
      const POLL_INTERVAL_MS = 5_000;
      let polls = 0;

      await new Promise<void>((resolve, reject) => {
        const check = async () => {
          try {
            const sermon = await getAdminSermon(sermonId);
            if (sermon.transcriptStatus === 'complete') {
              onTranscribed(sermon.transcript ?? sermon.fullTranscript ?? '');
              setPhase('transcribed');
              resolve();
            } else if (sermon.transcriptStatus === 'none') {
              // Server reset to "none" → background job failed
              reject(new Error('Transcription failed on the server. Please try again.'));
            } else if (++polls >= MAX_POLLS) {
              reject(new Error('Transcription is taking longer than expected. Check back shortly — the server is still processing.'));
            } else {
              setTimeout(check, POLL_INTERVAL_MS);
            }
          } catch (pollErr) {
            reject(pollErr);
          }
        };
        setTimeout(check, POLL_INTERVAL_MS);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transcription failed. Please try again.');
      setPhase('error');
    }
  }, [sermonId, onTranscribed]);

  const canUpload   = !!file && phase !== 'uploading' && !!sermonId;
  const canTranscribe = (hasExistingAudio || phase === 'uploaded') && phase !== 'transcribing' && transcriptStatus !== 'pending';

  // ─── File selected state ─────────────────────────────────────────────────
  if (file && phase !== 'error') {
    return (
      <div className="space-y-3">
        {/* File info */}
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-teal-200 bg-teal-50">
          <FileAudio size={18} className="text-teal-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-800 truncate">{file.name}</p>
            <p className="text-[11px] text-gray-500">{formatBytes(file.size)}</p>
          </div>
          {phase === 'idle' && (
            <button
              onClick={() => { setFile(null); setPhase('idle'); }}
              className="p-1 rounded hover:bg-teal-100 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
              title="Remove file"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Progress */}
        {phase === 'uploading' && (
          <div>
            <div className="flex justify-between text-[11px] text-gray-500 mb-1">
              <span>Uploading sermon audio…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-teal-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Success */}
        {phase === 'uploaded' && (
          <div className="flex items-center gap-2 text-[12px] text-teal-700">
            <CheckCircle2 size={13} />
            Audio uploaded successfully
          </div>
        )}

        {/* Upload button */}
        {phase === 'idle' && (
          <button
            onClick={handleUpload}
            disabled={!canUpload}
            className="w-full h-10 rounded-xl text-[13px] font-medium bg-teal-600 hover:bg-teal-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Upload size={14} />
            Upload to App Storage
          </button>
        )}

        {/* Transcribe button — shown after upload */}
        {(phase === 'uploaded' || phase === 'transcribing' || phase === 'transcribed') && (
          <button
            onClick={handleTranscribe}
            disabled={phase === 'transcribing'}
            className="w-full h-10 rounded-xl text-[13px] font-medium border border-gray-200 hover:border-teal-300 hover:bg-teal-50 text-gray-700 hover:text-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {phase === 'transcribing'
              ? <><Loader2 size={13} className="animate-spin" /> Transcribing…</>
              : phase === 'transcribed'
                ? <><CheckCircle2 size={13} className="text-teal-600" /> Transcribed — run again</>
                : <><Mic2 size={13} /> Transcribe with Whisper</>
            }
          </button>
        )}
      </div>
    );
  }

  // ─── Error state — file is preserved so the pastor can retry without re-selecting ──
  if (phase === 'error') {
    return (
      <div className="space-y-2">
        {/* Show the file that failed */}
        {file && (
          <div className="flex items-center gap-3 p-3.5 rounded-xl border border-red-200 bg-red-50">
            <FileAudio size={18} className="text-red-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-gray-800 truncate">{file.name}</p>
              <p className="text-[11px] text-gray-500">{formatBytes(file.size)}</p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[12px]">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Retry with the same file */}
          <button
            onClick={() => { setPhase('idle'); setError(''); setProgress(0); }}
            className="flex items-center gap-1.5 text-[12px] font-medium text-teal-700 hover:text-teal-900 transition-colors"
          >
            <RefreshCw size={12} /> Try again
          </button>
          {/* Choose a different file */}
          <button
            onClick={() => { setFile(null); setPhase('idle'); setError(''); setProgress(0); }}
            className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-800 transition-colors"
          >
            Choose a different file
          </button>
        </div>
      </div>
    );
  }

  // ─── Existing audio (no new file selected) ───────────────────────────────
  if (hasExistingAudio) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-teal-200 bg-teal-50">
          <FileAudio size={18} className="text-teal-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-800">Audio uploaded</p>
            <p className="text-[11px] text-gray-500 truncate">{currentPath.split('/').pop()}</p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-white/60 transition-colors flex-shrink-0"
          >
            Replace
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Transcript status + transcribe button */}
        {transcriptStatus === 'none' && canTranscribe && (
          <button
            onClick={handleTranscribe}
            disabled={!sermonId}
            className="w-full h-10 rounded-xl text-[13px] font-medium border border-gray-200 hover:border-teal-300 hover:bg-teal-50 text-gray-700 hover:text-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Mic2 size={13} /> Transcribe with Whisper
          </button>
        )}
        {transcriptStatus === 'pending' && (
          <div className="flex items-center gap-2 text-[12px] text-gray-500">
            <Loader2 size={12} className="animate-spin" /> Transcription in progress…
          </div>
        )}
        {transcriptStatus === 'complete' && (
          <div className="flex items-center gap-2 text-[12px] text-teal-700">
            <CheckCircle2 size={12} /> Transcript complete
            <button
              onClick={handleTranscribe}
              disabled={!sermonId}
              className="ml-auto text-[11px] text-gray-400 hover:text-gray-700 transition-colors"
            >
              Re-transcribe
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Idle / no file, no existing audio ───────────────────────────────────
  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          dragOver
            ? 'border-teal-400 bg-teal-50'
            : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
        }`}
      >
        <Upload size={20} className="mx-auto mb-2 text-gray-400" />
        <p className="text-[13px] font-medium text-gray-700">Upload Sermon Audio</p>
        <p className="text-[11px] text-gray-500 mt-1">
          MP3, M4A, WAV, MP4, MPEG or WEBM · Maximum {MAX_MB} MB
        </p>
        <p className="text-[11px] text-gray-400 mt-1">Click or drag and drop</p>
      </button>
      {error && (
        <p className="mt-2 text-[12px] text-red-600 flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </p>
      )}
      {!sermonId && (
        <p className="mt-2 text-[11px] text-gray-400">
          Save the sermon as a draft first, then upload audio.
        </p>
      )}
    </div>
  );
}
