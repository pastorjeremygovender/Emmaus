import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock,
  ExternalLink, FileText, Loader2, Play, RefreshCw, Search,
  Shield, Wifi, WifiOff, Youtube, XCircle, ChevronLeft,
} from 'lucide-react';
import {
  getArchiveStatus, syncChannel, listVideos, getVideo, updateVideo,
  processVideo, getSegments, listJobs, startOAuthFlow, disconnectOAuth,
  runPipeline, startSafeIndexingBatch, resumeSafeIndexing, getIndexingCheckpoint,
  runEnrichment, cancelArchiveJob, formatDuration, formatTimestamp,
  detectSermonStarts, repairTimestamps, generateAudio, getAudioStreamUrl,
  type ArchiveStatus, type VideoRecord, type SermonSegment, type ImportJob, type IndexingCheckpoint,
} from '@/lib/youtube-archive-api';
import { getPublicOrigin, getApiBase } from '@/lib/api';

// ─── Shared mini-components ──────────────────────────────────────────────────

const Pill = ({ label, color }: { label: string; color: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${color}`}>
    {label}
  </span>
);

const reviewColor = (s: VideoRecord['reviewStatus']) =>
  s === 'approved' ? 'bg-green-100 text-green-800' :
  s === 'auto-approved' ? 'bg-teal-100 text-teal-800' :
  s === 'rejected' ? 'bg-red-100 text-red-800' :
  'bg-amber-100 text-amber-800';

const transcriptColor = (s: VideoRecord['transcriptStatus']) =>
  s === 'complete' ? 'bg-green-100 text-green-800' :
  s === 'caption-imported' ? 'bg-blue-100 text-blue-800' :
  s === 'pending' ? 'bg-yellow-100 text-yellow-800' :
  s === 'failed' ? 'bg-red-100 text-red-800' :
  'bg-gray-100 text-gray-500';

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-[12px] text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Connection status panel ──────────────────────────────────────────────────

function ConnectionPanel({
  status,
  onRefresh,
}: {
  status: ArchiveStatus;
  onRefresh: () => void;
}) {
  const [disconnecting, setDisconnecting] = useState(false);

  // Listen for the popup's postMessage so we refresh immediately when OAuth succeeds
  // rather than using an unreliable setTimeout.
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data === 'oauth-success') onRefresh();
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRefresh]);

  const handleConnect = () => {
    startOAuthFlow();
    // Fallback poll in case the popup is blocked or postMessage is swallowed.
    const t = setTimeout(onRefresh, 6000);
    return () => clearTimeout(t);
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect YouTube OAuth? Caption imports will stop working.')) return;
    setDisconnecting(true);
    try { await disconnectOAuth(); onRefresh(); } finally { setDisconnecting(false); }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Youtube size={18} className="text-red-500" />
        <span className="font-semibold text-gray-800 text-[15px]">YouTube Connection</span>
      </div>

      {/* API connection */}
      <div className="flex items-start gap-3">
        {status.youtube.configured ? (
          <CheckCircle2 size={16} className="text-green-500 mt-0.5 flex-shrink-0" />
        ) : (
          <WifiOff size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
        )}
        <div>
          <div className="text-[13px] font-medium text-gray-800">YouTube Data API</div>
          {status.youtube.configured ? (
            <div className="text-[12px] text-gray-500 mt-0.5">
              {status.youtube.channelInfo
                ? `Connected — ${status.youtube.channelInfo.title} (${status.youtube.channelInfo.videoCount} videos)`
                : `Channel: ${status.youtube.channelId}`}
            </div>
          ) : (
            <div className="text-[12px] text-red-500 mt-0.5">
              Set YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID in environment secrets
            </div>
          )}
        </div>
      </div>

      {/* OAuth connection */}
      <div className="flex items-start gap-3">
        <Shield size={16} className={`mt-0.5 flex-shrink-0 ${status.oauth.connected ? 'text-green-500' : 'text-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-gray-800">Owner OAuth (caption access)</div>
          {status.oauth.connected ? (
            <div className="text-[12px] text-gray-500 mt-0.5">
              Connected{status.oauth.authorizedAt ? ` — authorized ${new Date(status.oauth.authorizedAt).toLocaleDateString()}` : ''}
            </div>
          ) : status.oauth.oauthConfigured ? (
            <div className="text-[12px] text-amber-600 mt-0.5">
              Not yet authorized — click <strong>Connect</strong> to open the Google sign-in popup.
            </div>
          ) : (
            <div className="text-[12px] text-gray-400 mt-0.5">
              Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI to enable caption import.
            </div>
          )}
        </div>
        {status.oauth.oauthConfigured && (
          <div className="flex-shrink-0">
            {status.oauth.connected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="text-[12px] text-red-500 hover:text-red-700 transition-colors"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="text-[12px] font-medium text-teal-600 hover:text-teal-800 transition-colors"
              >
                Connect
              </button>
            )}
          </div>
        )}
      </div>

      {/* Redirect URI hint — helps admins configure Google Cloud Console correctly */}
      {status.oauth.oauthConfigured && !status.oauth.connected && (
        <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
          <p className="text-[11px] font-medium text-gray-500 mb-1">Authorized redirect URI (must match Google Cloud Console exactly)</p>
          <code className="text-[11px] text-gray-700 break-all select-all">
            {getPublicOrigin()}/api/youtube-archive/oauth/callback
          </code>
        </div>
      )}
    </div>
  );
}

// ─── Video detail / process panel ─────────────────────────────────────────────

function VideoDetail({
  videoId,
  onBack,
  onUpdated,
}: {
  videoId: string;
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [video, setVideo] = useState<VideoRecord | null>(null);
  const [segments, setSegments] = useState<SermonSegment[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editSpeaker, setEditSpeaker] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editSeries, setEditSeries] = useState('');
  const [editSermonStart, setEditSermonStart] = useState('');
  const [editSermonEnd, setEditSermonEnd] = useState('');
  const [savingSermonStart, setSavingSermonStart] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [expandedSeg, setExpandedSeg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const v = await getVideo(videoId);
      setVideo(v);
      setEditSpeaker(v.speaker ?? '');
      setEditDate(v.sermonDate ?? '');
      setEditSeries(v.series ?? '');
      setEditSermonStart(v.manualSermonStartSeconds !== undefined ? String(v.manualSermonStartSeconds) : '');
      setEditSermonEnd(v.manualSermonEndSeconds !== undefined ? String(v.manualSermonEndSeconds) : String(v.durationSeconds));
      const segs = await getSegments(videoId);
      setSegments(segs.segments);
    } catch (e) {
      setError(String(e));
    }
  }, [videoId]);

  useEffect(() => { load(); }, [load]);

  if (!video) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500">
        <Loader2 size={18} className="animate-spin" />
        Loading…
      </div>
    );
  }

  const handleApprove = async (status: VideoRecord['reviewStatus']) => {
    setSaving(true);
    try {
      await updateVideo(video.id, {
        reviewStatus: status,
        speaker: editSpeaker || undefined,
        sermonDate: editDate || undefined,
        series: editSeries || undefined,
      });
      await load();
      onUpdated();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSermonStart = async () => {
    if (!video) return;
    setSavingSermonStart(true);
    try {
      const seconds = editSermonStart ? parseInt(editSermonStart, 10) : undefined;
      const end = editSermonEnd ? parseInt(editSermonEnd, 10) : undefined;
      if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0 || (end !== undefined && (!Number.isFinite(end) || end <= seconds || end > video.durationSeconds))) {
        throw new Error('Please set a valid range: start must be before the end and both must fit inside the video.');
      }
      await updateVideo(video.id, { manualSermonStartSeconds: seconds, manualSermonEndSeconds: end, sermonStartVerified: true });
      await load();
      onUpdated();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingSermonStart(false);
    }
  };

  const handleVerifySermonStart = async () => {
    if (!video) return;
    setSavingSermonStart(true);
    try {
      await updateVideo(video.id, { sermonStartVerified: true });
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingSermonStart(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!video) return;
    setGeneratingAudio(true);
    try {
      await generateAudio(video.id);
      // Poll until done
      const poll = setInterval(async () => {
        const v = await getVideo(videoId);
        setVideo(v);
        if (v.audioProcessingStatus === 'ready' || v.audioProcessingStatus === 'failed') {
          clearInterval(poll);
          setGeneratingAudio(false);
          onUpdated();
        }
      }, 3000);
    } catch (e) {
      setError(String(e));
      setGeneratingAudio(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setError(null);
    try {
      await processVideo(video.id);
      // Poll for completion
      const poll = setInterval(async () => {
        const v = await getVideo(videoId);
        setVideo(v);
        if (v.transcriptStatus === 'complete' || v.transcriptStatus === 'failed') {
          clearInterval(poll);
          setProcessing(false);
          const segs = await getSegments(videoId);
          setSegments(segs.segments);
          onUpdated();
        }
      }, 3000);
    } catch (e) {
      setError(String(e));
      setProcessing(false);
    }
  };

  const ytTimestampUrl = (startSeconds: number) =>
    `${video.youtubeUrl}&t=${Math.round(startSeconds)}s`;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Back */}
      <button onClick={onBack} className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 transition-colors">
        <ChevronLeft size={15} /> Back to videos
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-[13px] text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex gap-4 p-4">
          {video.thumbnailUrl && (
            <img src={video.thumbnailUrl} alt="" className="w-32 h-20 object-cover rounded flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 text-[15px] leading-tight">{video.title}</div>
            <div className="text-[12px] text-gray-400 mt-1">
              {new Date(video.publishedAt).toLocaleDateString()} · {formatDuration(video.durationSeconds)} ·
              <span className="ml-1">{Math.round(video.sermonLikelihood * 100)}% sermon likelihood</span>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Pill label={video.reviewStatus} color={reviewColor(video.reviewStatus)} />
              <Pill label={video.transcriptStatus} color={transcriptColor(video.transcriptStatus)} />
              {video.captionTrackKind && (
                <Pill label={video.captionTrackKind === 'standard' ? 'Manual captions' : 'Auto-captions'}
                  color="bg-blue-50 text-blue-700" />
              )}
            </div>
          </div>
          <a href={video.youtubeUrl} target="_blank" rel="noopener" className="flex-shrink-0 text-gray-400 hover:text-gray-700">
            <ExternalLink size={16} />
          </a>
        </div>

        {/* Classification reason */}
        <div className="border-t border-gray-100 px-4 py-2 bg-gray-50 text-[11px] text-gray-500">
          Classified as {video.contentType} — {video.classificationReason}
        </div>
      </div>

      {/* Admin metadata */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="font-medium text-[14px] text-gray-800">Verified Sermon Details</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-gray-500 font-medium">Speaker</label>
            <input
              className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-400"
              value={editSpeaker}
              onChange={(e) => setEditSpeaker(e.target.value)}
              placeholder="Pastor Name"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium">Service Date</label>
            <input
              type="date"
              className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-400"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <label className="text-[11px] text-gray-500 font-medium">Series</label>
            <input
              className="mt-1 w-full border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-400"
              value={editSeries}
              onChange={(e) => setEditSeries(e.target.value)}
              placeholder="e.g. Gospel of John"
            />
          </div>
        </div>

        {/* AI-derived metadata */}
        {(video.aiThemes?.length || video.aiScriptureRefs?.length) ? (
          <div className="mt-2 space-y-1">
            <div className="text-[11px] text-gray-400 font-medium">AI-derived (unverified)</div>
            {video.aiThemes?.length ? (
              <div className="text-[12px] text-gray-500">Themes: {video.aiThemes.join(', ')}</div>
            ) : null}
            {video.aiScriptureRefs?.length ? (
              <div className="text-[12px] text-gray-500">Scripture: {video.aiScriptureRefs.join(', ')}</div>
            ) : null}
            {video.aiSummary ? (
              <div className="text-[12px] text-gray-500 italic">{video.aiSummary}</div>
            ) : null}
          </div>
        ) : null}

        {/* Action buttons */}
        <div className="flex gap-2 pt-1 flex-wrap">
          <button
            onClick={() => handleApprove('approved')}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded text-[13px] hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
            Approve as Sermon
          </button>
          <button
            onClick={() => handleApprove('rejected')}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded text-[13px] hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <XCircle size={13} />
            Reject
          </button>
          <button
            onClick={handleProcess}
            disabled={processing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded text-[13px] hover:bg-teal-700 transition-colors disabled:opacity-50 ml-auto"
          >
            {processing ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            {processing
              ? 'Processing…'
              : video.transcriptStatus === 'failed'
                ? 'Retry Caption Import'
                : 'Import Captions & Segment'}
          </button>
        </div>

        {video.transcriptError && (
          <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            {video.transcriptError}
          </div>
        )}
      </div>

      {/* Sermon Timing */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="font-medium text-[14px] text-gray-800">Sermon Start Timing</div>
        {video.detectedSermonStartSeconds !== undefined || video.manualSermonStartSeconds !== undefined ? (
          <div className="flex gap-4 flex-wrap text-[13px]">
            {video.detectedSermonStartSeconds !== undefined && (
              <div>
                <div className="text-[11px] text-gray-500 font-medium">Auto-detected</div>
                <div className="font-mono text-gray-800">
                  {formatTimestamp(video.detectedSermonStartSeconds)}
                  <span className={[
                    'ml-1 text-[11px]',
                    (video.sermonStartConfidence ?? 0) >= 0.80 ? 'text-green-600' :
                    (video.sermonStartConfidence ?? 0) >= 0.70 ? 'text-amber-600' : 'text-red-500',
                  ].join(' ')}>
                    {Math.round((video.sermonStartConfidence ?? 0) * 100)}%
                  </span>
                  <span className="ml-1 text-gray-400 text-[11px]">· {video.sermonStartMethod}</span>
                </div>
              </div>
            )}
            {video.finalSermonStartSeconds !== undefined && video.finalSermonStartSeconds > 0 && (
              <div>
                <div className="text-[11px] text-gray-500 font-medium">
                  Effective {video.sermonStartVerified ? <span className="text-green-600 font-semibold">✓ Verified</span> : ''}
                </div>
                <div className="font-mono text-gray-800">
                  {formatTimestamp(video.finalSermonStartSeconds)}
                  <span className="ml-1 text-gray-400 text-[11px]">
                    {video.manualSermonStartSeconds !== undefined ? '(manual)' : '(auto)'}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[13px] text-gray-400">No sermon start detected. Run the pipeline or set manually.</div>
        )}

        {/* YouTube preview embed — plays from ~60s before detected start */}
        {video.detectedSermonStartSeconds !== undefined && (
          <div>
            <button
              onClick={() => setPreviewOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[12px] text-violet-700 hover:text-violet-900 transition-colors"
            >
              <Play size={12} className="fill-violet-700" />
              {previewOpen ? 'Hide preview' : 'Preview detected start (±60 s)'}
            </button>
            {previewOpen && (
              <div className="mt-2 rounded-lg overflow-hidden border border-gray-200 bg-black">
                <iframe
                  key={video.detectedSermonStartSeconds}
                  src={`https://www.youtube.com/embed/${video.youtubeVideoId}?start=${Math.max(0, video.detectedSermonStartSeconds - 60)}&autoplay=1&rel=0&modestbranding=1`}
                  className="w-full"
                  style={{ height: 200 }}
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  title="Sermon start preview"
                />
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[12px] font-medium text-gray-700">Mark the sermon section</div>
              <div className="text-[11px] text-gray-500">Drag the handles to set where the sermon starts and ends in the service.</div>
            </div>
            <div className="text-[12px] font-mono text-violet-700 whitespace-nowrap">
              {formatTimestamp(parseInt(editSermonStart || '0', 10))} – {formatTimestamp(parseInt(editSermonEnd || String(video.durationSeconds), 10))}
            </div>
          </div>
          <label className="block">
            <span className="flex justify-between text-[11px] text-gray-500 mb-1">
              <span>Start · {formatTimestamp(parseInt(editSermonStart || '0', 10))}</span>
              <span>0:00 – {formatDuration(video.durationSeconds)}</span>
            </span>
            <input
              type="range"
              min="0"
              max={video.durationSeconds}
              step="1"
              value={Math.min(video.durationSeconds, Math.max(0, parseInt(editSermonStart || '0', 10)))}
              onChange={(e) => setEditSermonStart(e.target.value)}
              className="w-full accent-violet-600"
              aria-label="Sermon start"
            />
          </label>
          <label className="block">
            <span className="flex justify-between text-[11px] text-gray-500 mb-1">
              <span>End · {formatTimestamp(parseInt(editSermonEnd || String(video.durationSeconds), 10))}</span>
              <span>{formatDuration(video.durationSeconds)}</span>
            </span>
            <input
              type="range"
              min="1"
              max={video.durationSeconds}
              step="1"
              value={Math.min(video.durationSeconds, Math.max(1, parseInt(editSermonEnd || String(video.durationSeconds), 10)))}
              onChange={(e) => setEditSermonEnd(e.target.value)}
              className="w-full accent-violet-600"
              aria-label="Sermon end"
            />
          </label>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="number"
            min="0"
            step="1"
            className="border border-gray-200 rounded px-2 py-1.5 text-[13px] w-28 focus:outline-none focus:ring-1 focus:ring-teal-400"
            placeholder="Seconds"
            value={editSermonStart}
            onChange={(e) => setEditSermonStart(e.target.value)}
          />
          <input
            type="number"
            min="1"
            max={video.durationSeconds}
            step="1"
            className="border border-gray-200 rounded px-2 py-1.5 text-[13px] w-28 focus:outline-none focus:ring-1 focus:ring-teal-400"
            placeholder="End seconds"
            value={editSermonEnd}
            onChange={(e) => setEditSermonEnd(e.target.value)}
            aria-label="Sermon end seconds"
          />
          <button
            onClick={handleSaveSermonStart}
            disabled={savingSermonStart || !editSermonStart}
            className="px-3 py-1.5 text-[13px] bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-40 transition-colors"
          >
            {savingSermonStart ? <Loader2 size={12} className="inline animate-spin mr-1" /> : null}
            Set Manual Start
          </button>
          {video.detectedSermonStartSeconds !== undefined && !video.sermonStartVerified && (
            <button
              onClick={handleVerifySermonStart}
              disabled={savingSermonStart}
              className="px-3 py-1.5 text-[13px] border border-green-300 text-green-700 rounded hover:bg-green-50 disabled:opacity-40 transition-colors"
            >
              ✓ Verify Detection
            </button>
          )}
        </div>
      </div>

      {/* Audio Asset */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="font-medium text-[14px] text-gray-800">Sermon Audio</div>
        {video.audioProcessingStatus === 'ready' ? (
          <div className="space-y-2">
            <div className="text-[13px] text-green-700">
              ✓ Ready{video.audioDurationSeconds ? ` · ${formatDuration(video.audioDurationSeconds)}` : ''}
            </div>
            <audio controls src={getAudioStreamUrl(video.id)} className="w-full h-8" preload="metadata" />
          </div>
        ) : video.audioProcessingStatus === 'processing' || generatingAudio ? (
          <div className="flex items-center gap-2 text-[13px] text-blue-700">
            <Loader2 size={14} className="animate-spin" /> Generating audio…
          </div>
        ) : video.audioProcessingStatus === 'failed' ? (
          <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded p-2">
            {video.audioError?.slice(0, 200) ?? 'Unknown error'}
          </div>
        ) : (
          <div className="text-[13px] text-gray-400">No audio generated yet</div>
        )}
        {video.audioProcessingStatus !== 'processing' && !generatingAudio && (video.finalSermonStartSeconds !== undefined || video.manualSermonStartSeconds !== undefined) && (
          <button
            onClick={handleGenerateAudio}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
          >
            {video.audioProcessingStatus === 'ready' ? '↺ Re-generate' : '⬇ Generate Sermon Audio'}
          </button>
        )}
        {!video.finalSermonStartSeconds && !video.manualSermonStartSeconds && (
          <p className="text-[11px] text-amber-600">Set a sermon start time above before generating audio.</p>
        )}
      </div>

      {/* Segments */}
      {segments.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-medium text-[14px] text-gray-800">
              Timestamped Segments ({segments.length})
            </span>
            <span className="text-[12px] text-gray-400">Click to expand · Watch opens YouTube at timestamp</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {segments.map((seg) => (
              <div key={seg.id} className="px-4 py-2.5">
                <button
                  className="w-full flex items-center gap-3 text-left"
                  onClick={() => setExpandedSeg(expandedSeg === seg.id ? null : seg.id)}
                >
                  <span className="text-[12px] font-mono text-teal-700 flex-shrink-0 w-12">
                    {formatTimestamp(seg.startTimeSeconds)}
                  </span>
                  <span className="text-[13px] text-gray-700 flex-1 truncate">
                    {seg.summary || seg.cleanedText.slice(0, 100)}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={ytTimestampUrl(seg.startTimeSeconds)}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 transition-colors"
                    >
                      <Play size={11} /> Watch
                    </a>
                    {expandedSeg === seg.id
                      ? <ChevronDown size={14} className="text-gray-400" />
                      : <ChevronRight size={14} className="text-gray-400" />
                    }
                  </div>
                </button>
                {expandedSeg === seg.id && (
                  <div className="mt-2 ml-[60px] space-y-2">
                    <p className="text-[12px] text-gray-600 leading-relaxed">{seg.cleanedText}</p>
                    {(seg.themes?.length || seg.scriptureRefs?.length) ? (
                      <div className="flex gap-3 flex-wrap text-[11px] text-gray-400">
                        {seg.themes?.map((t) => <span key={t} className="bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded">{t}</span>)}
                        {seg.scriptureRefs?.map((r) => <span key={r} className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{r}</span>)}
                      </div>
                    ) : null}
                    <div className="text-[11px] text-gray-400">
                      {formatTimestamp(seg.startTimeSeconds)} – {formatTimestamp(seg.endTimeSeconds)} · {seg.wordCount} words
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main YoutubeArchive page ─────────────────────────────────────────────────

type View = 'dashboard' | 'videos' | 'video-detail';

export default function YoutubeArchive() {
  const [view, setView] = useState<View>('dashboard');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);

  const [status, setStatus] = useState<ArchiveStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncJobId, setSyncJobId] = useState<string | null>(null);
  const [pipelining, setPipelining] = useState(false);
  const [pipelineJobId, setPipelineJobId] = useState<string | null>(null);
  const [pipelineJob, setPipelineJob] = useState<ImportJob | null>(null);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [checkpoint, setCheckpoint] = useState<IndexingCheckpoint | null>(null);
  const [showFullRebuild, setShowFullRebuild] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichJobId, setEnrichJobId] = useState<string | null>(null);
  const [enrichJob, setEnrichJob] = useState<ImportJob | null>(null);
  const [detectingStarts, setDetectingStarts] = useState(false);
  const [detectStartsJobId, setDetectStartsJobId] = useState<string | null>(null);
  const [repairingTimestamps, setRepairingTimestamps] = useState(false);
  const [repairJobId, setRepairJobId] = useState<string | null>(null);

  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [videosTotal, setVideosTotal] = useState(0);
  const [videosLoading, setVideosLoading] = useState(false);
  const [filterReview, setFilterReview] = useState<string>('');
  const [filterContent, setFilterContent] = useState<string>('');
  const [showFailedOnly, setShowFailedOnly] = useState(false);
  const [filterTimingReview, setFilterTimingReview] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [jobs, setJobs] = useState<ImportJob[]>([]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await getArchiveStatus();
      setStatus(s);
      setStatusError(null);
    } catch (e) {
      setStatusError(String(e));
    }
  }, []);

  const loadCheckpoint = useCallback(async () => {
    try { setCheckpoint((await getIndexingCheckpoint()).checkpoint); } catch { setCheckpoint(null); }
  }, []);

  const loadVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const result = await listVideos({
        reviewStatus: filterReview as VideoRecord['reviewStatus'] || undefined,
        contentType: filterContent as VideoRecord['contentType'] || undefined,
        transcriptStatus: showFailedOnly ? 'failed' : undefined,
      });
      setVideos(result.videos);
      setVideosTotal(result.total);
    } catch {
      // silently fail
    } finally {
      setVideosLoading(false);
    }
  }, [filterReview, filterContent, showFailedOnly]);

  const loadJobs = useCallback(async () => {
    try {
      const result = await listJobs();
      setJobs(result.jobs.slice(0, 10));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);
  useEffect(() => { loadCheckpoint(); }, [loadCheckpoint]);
  useEffect(() => { if (view === 'videos') loadVideos(); }, [view, loadVideos]);
  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Poll detect-sermon-starts job
  useEffect(() => {
    if (!detectStartsJobId || !detectingStarts) return;
    const iv = setInterval(async () => {
      const r = await listJobs().catch(() => ({ jobs: [] }));
      const job = r.jobs.find((j: ImportJob) => j.id === detectStartsJobId);
      if (job && (job.status === 'completed' || job.status === 'failed')) {
        setDetectingStarts(false);
        clearInterval(iv);
        loadStatus();
        loadJobs();
      }
      setJobs(r.jobs.slice(0, 10));
    }, 3000);
    return () => clearInterval(iv);
  }, [detectStartsJobId, detectingStarts, loadStatus, loadJobs]);

  // Poll repair-timestamps job
  useEffect(() => {
    if (!repairJobId || !repairingTimestamps) return;
    const iv = setInterval(async () => {
      const r = await listJobs().catch(() => ({ jobs: [] }));
      const job = r.jobs.find((j: ImportJob) => j.id === repairJobId);
      if (job && (job.status === 'completed' || job.status === 'failed')) {
        setRepairingTimestamps(false);
        clearInterval(iv);
        loadStatus();
        loadJobs();
      }
      setJobs(r.jobs.slice(0, 10));
    }, 3000);
    return () => clearInterval(iv);
  }, [repairJobId, repairingTimestamps, loadStatus, loadJobs]);

  // Poll while a sync job is active
  useEffect(() => {
    if (syncJobId && syncing) {
      pollRef.current = setInterval(async () => {
        const result = await listJobs().catch(() => ({ jobs: [] }));
        const job = result.jobs.find((j: ImportJob) => j.id === syncJobId);
        if (job) {
          if (job.status === 'completed' || job.status === 'failed') {
            setSyncing(false);
            setSyncJobId(null);
            clearInterval(pollRef.current!);
            await loadStatus();
            await loadJobs();
            if (view === 'videos') await loadVideos();
          }
        }
        setJobs(result.jobs.slice(0, 10));
      }, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [syncJobId, syncing, view, loadStatus, loadJobs, loadVideos]);

  const handleSync = async (maxVideos: number) => {
    setSyncing(true);
    try {
      const result = await syncChannel(maxVideos);
      setSyncJobId(result.jobId);
    } catch (e) {
      setSyncing(false);
      setStatusError(String(e));
    }
  };

  const handleSafeBatch = async (resume = false) => {
    setPipelining(true);
    setPipelineJob(null);
    try {
      const result = resume ? await resumeSafeIndexing() : await startSafeIndexingBatch();
      setPipelineJobId(result.jobId);
    } catch (e) {
      setPipelining(false);
      setStatusError(String(e));
    }
  };

  const handleFullRebuild = async () => {
    if (!confirm('This may re-request captions and rebuild completed sermons. Continue only for an intentional full rebuild?')) return;
    setPipelining(true);
    setPipelineJob(null);
    try {
      const result = await runPipeline(true);
      setPipelineJobId(result.jobId);
    } catch (e) {
      setPipelining(false);
      setStatusError(String(e));
    }
  };

  const handleCancelJob = async (job: ImportJob) => {
    if (!confirm('Stop this pipeline? The current video may finish, then the job will stop. Completed videos will be kept and safe indexing can be resumed later.')) return;
    setCancellingJobId(job.id);
    try {
      const result = await cancelArchiveJob(job.id);
      setPipelineJob(result.job);
      setPipelining(false);
      await Promise.all([loadJobs(), loadCheckpoint(), loadStatus()]);
    } catch (e) {
      setStatusError(String(e));
    } finally {
      setCancellingJobId(null);
    }
  };

  const handleRunEnrichment = async () => {
    setEnriching(true);
    setEnrichJob(null);
    try {
      const result = await runEnrichment();
      setEnrichJobId(result.jobId);
    } catch (e) {
      setEnriching(false);
      setStatusError(String(e));
    }
  };

  const handleDetectSermonStarts = async () => {
    setDetectingStarts(true);
    try {
      const result = await detectSermonStarts();
      setDetectStartsJobId(result.jobId);
    } catch (e) {
      setDetectingStarts(false);
      setStatusError(String(e));
    }
  };

  const handleRepairTimestamps = async () => {
    setRepairingTimestamps(true);
    try {
      const result = await repairTimestamps();
      setRepairJobId(result.jobId);
    } catch (e) {
      setRepairingTimestamps(false);
      setStatusError(String(e));
    }
  };

  const handleReviewStatus = async (video: VideoRecord, reviewStatus: 'approved' | 'rejected') => {
    try {
      await updateVideo(video.id, { reviewStatus });
      setVideos((current) => current.map((item) => item.id === video.id ? { ...item, reviewStatus } : item));
      await loadStatus();
    } catch (e) {
      setStatusError(String(e));
    }
  };

  // Poll while pipeline is running
  useEffect(() => {
    if (!pipelineJobId || !pipelining) return;
    const interval = setInterval(async () => {
      const result = await listJobs().catch(() => ({ jobs: [] }));
      const job = result.jobs.find((j: ImportJob) => j.id === pipelineJobId);
      if (job) {
        setPipelineJob(job);
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'paused') {
          setPipelining(false);
          clearInterval(interval);
          await loadStatus();
          await loadJobs();
          if (view === 'videos') await loadVideos();
          await loadCheckpoint();
        }
      }
      setJobs(result.jobs.slice(0, 10));
    }, 3000);
    return () => clearInterval(interval);
  }, [pipelineJobId, pipelining, view, loadStatus, loadJobs, loadVideos, loadCheckpoint]);

  // Poll while enrichment is running
  useEffect(() => {
    if (!enrichJobId || !enriching) return;
    const interval = setInterval(async () => {
      const result = await listJobs().catch(() => ({ jobs: [] }));
      const job = result.jobs.find((j: ImportJob) => j.id === enrichJobId);
      if (job) {
        setEnrichJob(job);
        if (job.status === 'completed' || job.status === 'failed') {
          setEnriching(false);
          clearInterval(interval);
          await loadStatus();
          await loadJobs();
        }
      }
      setJobs(result.jobs.slice(0, 10));
    }, 3000);
    return () => clearInterval(interval);
  }, [enrichJobId, enriching, loadStatus, loadJobs]);

  const filteredVideos = videos.filter((v) => {
    if (showFailedOnly && v.transcriptStatus !== 'failed') return false;
    if (filterTimingReview) {
      // Needs review = approved/transcribed but no detection, OR low confidence and unverified
      const isApproved = v.reviewStatus === 'approved' || v.reviewStatus === 'auto-approved';
      const hasTranscript = v.transcriptStatus === 'complete' || v.transcriptStatus === 'caption-imported';
      if (!isApproved || !hasTranscript) return false;
      if (v.sermonStartVerified) return false;
      const noDetection = v.detectedSermonStartSeconds === undefined && v.manualSermonStartSeconds === undefined;
      const lowConfidence = v.sermonStartConfidence !== undefined && v.sermonStartConfidence < 0.70;
      if (!noDetection && !lowConfidence) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!v.title.toLowerCase().includes(q) && !v.speaker?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // ── Video detail view ────────────────────────────────────────────────────

  if (view === 'video-detail' && selectedVideoId) {
    return (
      <VideoDetail
        videoId={selectedVideoId}
        onBack={() => { setView('videos'); setSelectedVideoId(null); }}
        onUpdated={() => { loadStatus(); loadVideos(); }}
      />
    );
  }

  // ── Videos list view ─────────────────────────────────────────────────────

  if (view === 'videos') {
    return (
      <div className="p-6 lg:p-8 max-w-5xl space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => setView('dashboard')} className="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 mb-1">
              <ChevronLeft size={14} /> Archive
            </button>
            <h1 className="text-[20px] font-semibold text-gray-900">Videos ({videosTotal})</h1>
          </div>
          <button onClick={loadVideos} className="text-gray-400 hover:text-gray-700">
            <RefreshCw size={16} className={videosLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded text-[13px] w-56 focus:outline-none focus:ring-1 focus:ring-teal-400"
              placeholder="Search by title or speaker"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-400"
            value={filterReview}
            onChange={(e) => { setFilterReview(e.target.value); loadVideos(); }}
          >
            <option value="">All review statuses</option>
            <option value="pending">Pending review</option>
            <option value="approved">Approved</option>
            <option value="auto-approved">Auto-approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <select
            className="border border-gray-200 rounded px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-teal-400"
            value={filterContent}
            onChange={(e) => { setFilterContent(e.target.value); loadVideos(); }}
          >
            <option value="">All content types</option>
            <option value="sermon">Sermons</option>
            <option value="worship">Worship</option>
            <option value="announcement">Announcements</option>
            <option value="unknown">Unknown</option>
          </select>
          {/* Timing review quick-filter */}
          <button
            onClick={() => setFilterTimingReview((f) => !f)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] border transition-colors',
              filterTimingReview
                ? 'bg-amber-100 border-amber-400 text-amber-800 font-medium'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            ⚠ Needs Timing Review
            {filterTimingReview && <span className="text-[11px] ml-0.5">({filteredVideos.length})</span>}
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {videosLoading ? (
            <div className="p-8 flex items-center justify-center gap-2 text-gray-400">
              <Loader2 size={16} className="animate-spin" /> Loading…
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="p-8 text-center text-[14px] text-gray-400">
              No videos found. Run a channel sync to discover videos.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-left">
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-[12px]">Title</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-[12px] hidden sm:table-cell">Duration</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-[12px]">Status</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-[12px]">Transcript</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500 text-[12px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredVideos.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => { setSelectedVideoId(v.id); setView('video-detail'); }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 leading-snug line-clamp-1">{v.title}</div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {new Date(v.publishedAt).toLocaleDateString()}
                        {v.speaker ? ` · ${v.speaker}` : ''}
                        <span className="ml-1 text-gray-300">· {Math.round(v.sermonLikelihood * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-gray-500 text-[12px]">
                      {formatDuration(v.durationSeconds)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill label={v.reviewStatus} color={reviewColor(v.reviewStatus)} />
                    </td>
                    <td className="px-4 py-3">
                      <Pill label={v.transcriptStatus} color={transcriptColor(v.transcriptStatus)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {v.reviewStatus === 'pending' && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReviewStatus(v, 'approved'); }}
                              className="text-green-600 hover:text-green-800 text-[11px] font-medium"
                              title="Approve as sermon"
                            >
                              Approve
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleReviewStatus(v, 'rejected'); }}
                              className="text-red-500 hover:text-red-700 text-[11px] font-medium"
                              title="Reject video"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <a
                          href={v.youtubeUrl}
                          target="_blank"
                          rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="text-gray-400 hover:text-gray-700 inline-flex"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // ── Dashboard view ────────────────────────────────────────────────────────

  const activeJob = jobs.find((j) => j.status === 'running' || j.status === 'queued');
  const activePipelineJob = jobs.find((j) =>
    (j.status === 'running' || j.status === 'queued') && j.type === 'pipeline-run'
  );

  return (
    <div className="p-6 lg:p-8 max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900 flex items-center gap-2">
            <Youtube size={20} className="text-red-500" />
            YouTube Archive
          </h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Import, classify, and index sermons from the church YouTube channel.</p>
        </div>
        <button onClick={loadStatus} className="text-gray-400 hover:text-gray-700">
          <RefreshCw size={16} />
        </button>
      </div>

      {statusError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-[13px] text-red-700 flex items-start gap-2">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          {statusError}
        </div>
      )}

      {/* Connection */}
      {status && <ConnectionPanel status={status} onRefresh={loadStatus} />}

      {/* Stats */}
      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Videos discovered" value={status.stats.videosDiscovered} />
          <StatCard label="Likely sermons" value={status.stats.likelySermons} />
          <StatCard label="Approved sermons" value={status.stats.approvedSermons} />
          <StatCard label="Segments indexed" value={status.stats.segmentsCreated} />
          <StatCard label="Transcripts ready" value={status.stats.transcriptsAvailable} />
          <StatCard label="Transcripts missing" value={status.stats.transcriptsMissing} />
          <StatCard label="Pending review" value={status.stats.pendingReview} />
          <StatCard label="Import failures" value={status.stats.failedImports} />
          <StatCard
            label="Starts detected"
            value={status.stats.sermonStartsDetected ?? 0}
            sub={status.stats.sermonStartsDetected
              ? `${Math.round(((status.stats.sermonStartsVerified ?? 0) / status.stats.sermonStartsDetected) * 100)}% verified`
              : undefined}
          />
          <StatCard label="Needs timing review" value={status.stats.sermonStartsNeedingReview ?? 0} />
          <StatCard label="Timing verified" value={status.stats.sermonStartsVerified ?? 0} />
          <StatCard label="Audio ready" value={status.stats.audioAssetsReady ?? 0} />
        </div>
      )}

      {/* Import actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div className="font-semibold text-[14px] text-gray-800">Channel Sync</div>

        {/* Active sync job progress */}
        {(syncing || (activeJob && activeJob.type === 'sync')) && (
          <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[13px] text-teal-800 font-medium">
              <Loader2 size={14} className="animate-spin" />
              Syncing channel…
            </div>
            {activeJob && (
              <div className="text-[12px] text-teal-700">
                {activeJob.progress.done} / {activeJob.progress.total} videos
                {activeJob.progress.failed ? ` (${activeJob.progress.failed} failed)` : ''}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => handleSync(20)}
            disabled={syncing || !status?.youtube.configured}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-40"
          >
            <Wifi size={14} /> Sync Latest 20 Videos
          </button>
          <button
            onClick={() => handleSync(500)}
            disabled={syncing || !status?.youtube.configured}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-[13px] hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} /> Full Channel Sync
          </button>
          <button
            onClick={() => { setView('videos'); loadVideos(); }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-[13px] hover:bg-gray-50 transition-colors ml-auto"
          >
            Browse All Videos →
          </button>
        </div>

        {!status?.youtube.configured && (
          <p className="text-[12px] text-amber-700">
            Set YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID in environment secrets to enable sync.
          </p>
        )}
      </div>

      {/* Sermon Indexing Pipeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <div className="font-semibold text-[14px] text-gray-800">Sermon Indexing Pipeline</div>
          <p className="text-[12px] text-gray-500 mt-1">
            Processes only videos you have approved, downloads captions, splits transcripts into
            timestamped segments, and builds the search index for Ask Emmaus.
          </p>
        </div>

        {/* Pipeline progress */}
        {checkpoint?.status === 'paused' && !pipelining && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-[14px] text-amber-900 font-semibold">
              <AlertCircle size={16} /> Indexing paused — resumable checkpoint saved
            </div>
            <div className="text-[12px] text-amber-800">
              Position {checkpoint.position + 1} of {checkpoint.videoIds.length} · {checkpoint.completedCount} completed · {checkpoint.remainingCount} remaining
            </div>
            <div className="text-[12px] text-amber-800">
              Pause reason: {checkpoint.pauseReason || 'Quota or service limit reached'}
            </div>
            <button onClick={() => handleSafeBatch(true)} className="mt-1 flex items-center gap-2 px-4 py-2 bg-amber-700 text-white rounded-lg text-[13px] font-medium hover:bg-amber-800">
              <Play size={14} /> Resume Indexing
            </button>
          </div>
        )}
        {!checkpoint && !pipelining && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[12px] text-gray-600">
            No resumable checkpoint exists. Start Safe Indexing Batch.
          </div>
        )}
        {pipelining && pipelineJob && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[13px] text-blue-800 font-medium">
                <Loader2 size={14} className="animate-spin" />
                Indexing sermons…
              </div>
              {(pipelineJob.status === 'running' || pipelineJob.status === 'queued') && (
                <button
                  onClick={() => handleCancelJob(pipelineJob)}
                  disabled={cancellingJobId === pipelineJob.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 border border-red-300 text-red-700 rounded-md text-[12px] font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  {cancellingJobId === pipelineJob.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                  Stop
                </button>
              )}
            </div>
            <div className="text-[12px] text-blue-700">
              {pipelineJob.progress.done} / {pipelineJob.progress.total} processed
              {pipelineJob.progress.skipped ? ` · ${pipelineJob.progress.skipped} already complete` : ''}
              {pipelineJob.progress.failed ? ` · ${pipelineJob.progress.failed} failed` : ''}
            </div>
            {pipelineJob.progress.currentItem && (
              <div className="text-[11px] text-blue-600 truncate">
                {pipelineJob.progress.currentItem}
              </div>
            )}
          </div>
        )}
        {!pipelining && activePipelineJob && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[13px] text-blue-800 font-medium">
              <Loader2 size={14} className="animate-spin" />
              Indexing pipeline is still running ({activePipelineJob.progress.done}/{activePipelineJob.progress.total})
            </div>
            <button
              onClick={() => handleCancelJob(activePipelineJob)}
              disabled={cancellingJobId === activePipelineJob.id}
              className="flex items-center gap-1.5 px-2.5 py-1 border border-red-300 text-red-700 rounded-md text-[12px] font-medium hover:bg-red-50 disabled:opacity-50"
            >
              {cancellingJobId === activePipelineJob.id ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
              Stop
            </button>
          </div>
        )}

        {pipelining && !pipelineJob && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-[13px] text-blue-800 font-medium">
              <Loader2 size={14} className="animate-spin" />
              Starting pipeline…
            </div>
          </div>
        )}

        {/* Completed pipeline result */}
        {!pipelining && pipelineJob?.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-0.5">
            <div className="flex items-center gap-2 text-[13px] text-green-800 font-medium">
              <CheckCircle2 size={14} />
              Pipeline complete
            </div>
            {pipelineJob.progress.currentItem && (
              <div className="text-[12px] text-green-700">{pipelineJob.progress.currentItem}</div>
            )}
            {!!pipelineJob.progress.failures?.length && (
              <div className="mt-2 space-y-1 text-[11px] text-red-700">
                {pipelineJob.progress.failures.map((failure) => (
                  <div key={`${failure.itemId}-${failure.at}`}>
                    <strong>{failure.itemTitle || failure.itemId}:</strong> {failure.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!pipelining && pipelineJob?.status === 'failed' && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-[13px] text-red-700 font-medium">
              <AlertCircle size={14} />
              Pipeline failed: {pipelineJob.error?.slice(0, 120)}
            </div>
          </div>
        )}

        <div className="flex gap-3 items-center flex-wrap">
          <button
            onClick={() => handleSafeBatch(false)}
            disabled={pipelining || enriching || !status?.oauth.connected}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-[13px] font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            {pipelining
              ? <><Loader2 size={14} className="animate-spin" /> Running…</>
              : <><Play size={14} /> Start Safe Indexing Batch</>
            }
          </button>
          {!pipelining && (pipelineJob?.progress.failures?.length || (status?.stats.failedImports ?? 0) > 0) ? (
            <button
              onClick={() => handleSafeBatch(false)}
              disabled={enriching || !status?.oauth.connected}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg text-[13px] hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              <RefreshCw size={14} /> Retry Failed
            </button>
          ) : null}
          <button
            onClick={() => setShowFullRebuild((value) => !value)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-500 rounded-lg text-[12px] hover:bg-gray-50"
          >
            <ChevronRight size={13} className={showFullRebuild ? 'rotate-90' : ''} /> Advanced
          </button>
          {(status?.stats.failedImports ?? 0) > 0 && (
            <button
              onClick={() => { setShowFailedOnly(true); setView('videos'); }}
              className="flex items-center gap-2 px-4 py-2 border border-amber-300 text-amber-800 rounded-lg text-[13px] hover:bg-amber-50 transition-colors"
            >
              <AlertCircle size={14} /> View Failed Items ({status.stats.failedImports})
            </button>
          )}
          <button
            onClick={handleRunEnrichment}
            disabled={pipelining || enriching || !status?.oauth.connected}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg text-[13px] hover:bg-indigo-50 transition-colors disabled:opacity-40"
          >
            {enriching
              ? <><Loader2 size={14} className="animate-spin" /> Enriching…</>
              : <>Re-run AI Enrichment</>
            }
          </button>
          {!status?.oauth.connected && (
            <span className="text-[12px] text-amber-600">Connect YouTube OAuth first to enable caption download</span>
          )}
          {status?.oauth.connected && !pipelining && !enriching && (
            <span className="text-[12px] text-gray-400">
              {status.stats.pendingReview} pending · {status.stats.approvedSermons} approved · {status.stats.segmentsCreated} persisted segments
            </span>
          )}
        </div>

        {showFullRebuild && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-3 text-[12px] text-red-800 space-y-2">
            <strong>Advanced full rebuild</strong>
            <p>This may re-request captions and reprocess completed sermons. Use only for deliberate maintenance; normal indexing must use the safe batch.</p>
            <button onClick={handleFullRebuild} disabled={pipelining || enriching || !status?.oauth.connected} className="px-3 py-1.5 border border-red-300 rounded text-red-700 hover:bg-red-100 disabled:opacity-40">
              Confirm and Run Full Rebuild
            </button>
          </div>
        )}

        {/* Enrichment progress */}
        {enriching && enrichJob && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-[13px] text-purple-800 font-medium">
              <Loader2 size={14} className="animate-spin" />
              AI enrichment running…
            </div>
            <div className="text-[12px] text-purple-700">
              {enrichJob.progress.done} / {enrichJob.progress.total} segments
              {enrichJob.progress.failed ? ` · ${enrichJob.progress.failed} failed` : ''}
            </div>
          </div>
        )}
        {enriching && !enrichJob && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-[13px] text-purple-800">
              <Loader2 size={14} className="animate-spin" /> Starting enrichment…
            </div>
          </div>
        )}
        {!enriching && enrichJob?.status === 'completed' && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 text-[13px] text-green-800 font-medium">
              <CheckCircle2 size={14} />
              Enrichment complete — {enrichJob.progress.currentItem}
            </div>
          </div>
        )}
      </div>

      {/* Sermon Timing Pipeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <div>
          <div className="font-semibold text-[14px] text-gray-800">Sermon Timing Pipeline</div>
          <p className="text-[12px] text-gray-500 mt-1">
            Detect where the sermon starts in each video (vs. worship &amp; announcements),
            then repair all segment timestamps. Run after the indexing pipeline completes.
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={handleDetectSermonStarts}
            disabled={detectingStarts || repairingTimestamps}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-[13px] font-medium hover:bg-violet-700 transition-colors disabled:opacity-40"
          >
            {detectingStarts
              ? <><Loader2 size={14} className="animate-spin" /> Detecting…</>
              : <>🎯 Detect Sermon Starts</>
            }
          </button>
          <button
            onClick={handleRepairTimestamps}
            disabled={repairingTimestamps || detectingStarts}
            className="flex items-center gap-2 px-4 py-2 border border-violet-300 text-violet-700 rounded-lg text-[13px] hover:bg-violet-50 transition-colors disabled:opacity-40"
          >
            {repairingTimestamps
              ? <><Loader2 size={14} className="animate-spin" /> Repairing…</>
              : <>🔧 Repair Timestamps</>
            }
          </button>
          <span className="text-[12px] text-gray-400 self-center">
            {status?.stats.sermonStartsDetected ?? 0} detected · {status?.stats.sermonStartsNeedingReview ?? 0} need review
          </span>
        </div>
      </div>

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="font-medium text-[14px] text-gray-800">Recent Jobs</span>
          </div>
          <div className="divide-y divide-gray-50">
            {jobs.map((job) => (
              <div key={job.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-shrink-0">
                  {job.status === 'completed' ? <CheckCircle2 size={14} className="text-green-500" /> :
                   job.status === 'failed' ? <XCircle size={14} className="text-red-400" /> :
                   job.status === 'running' ? <Loader2 size={14} className="text-teal-500 animate-spin" /> :
                   <Clock size={14} className="text-gray-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] text-gray-800">{job.type}</span>
                  {job.error && <span className="ml-2 text-[12px] text-red-500">{job.error.slice(0, 60)}</span>}
                </div>
                <div className="text-[11px] text-gray-400 flex-shrink-0">
                  {job.progress.done}/{job.progress.total}
                </div>
                <div className="text-[11px] text-gray-400 flex-shrink-0">
                  {new Date(job.updatedAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
