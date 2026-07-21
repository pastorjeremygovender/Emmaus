import React, { useState } from 'react';
import { useMediaStudio } from '@/contexts/MediaStudioContext';
import {
  ASSET_GROUPS, ASSET_LABELS, GRAPHIC_ASSET_TYPES, VIDEO_ASSET_TYPES, STATUS_ORDER,
  SCHEDULED_DAYS,
  type MediaAsset, type MediaAssetStatus, type MediaAssetType, type SuggestedShort,
} from '@/lib/media-studio-types';
import type { GraphicContent } from '@/lib/media-studio-types';
import {
  StatusBadge, AdminBtn, ConfirmDialog, CollapsibleCard, Field, TextArea, TextInput, Select, PageHeader,
} from '../shared';
import GraphicPreview from './GraphicPreview';

type Props = {
  kitId: string | null;
  onBack: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextStatus(current: MediaAssetStatus): MediaAssetStatus | null {
  const idx = STATUS_ORDER.indexOf(current);
  return idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null;
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function parseGraphic(raw: string): GraphicContent | null {
  try { return JSON.parse(raw) as GraphicContent; } catch { return null; }
}

function parseShorts(raw: string): SuggestedShort[] {
  try { return JSON.parse(raw) as SuggestedShort[]; } catch { return []; }
}

// ─── Graphic editor ───────────────────────────────────────────────────────────

function GraphicEditor({
  asset,
  onSave,
}: {
  asset: MediaAsset;
  onSave: (content: string) => void;
}) {
  const gc = parseGraphic(asset.content) ?? { quote: '', scripture: '', template: 'classic' as const, church: 'Isipingo Community Church', dimensions: '1080×1080' };
  const [form, setForm] = useState(gc);
  const [isDirty, setIsDirty] = useState(false);

  const patch = (k: keyof GraphicContent, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setIsDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Field label="Quote">
            <TextArea
              rows={3}
              value={form.quote}
              onChange={e => patch('quote', e.target.value)}
              placeholder="Quote or key takeaway…"
            />
          </Field>
          <Field label="Scripture Reference">
            <TextInput
              value={form.scripture}
              onChange={e => patch('scripture', e.target.value)}
              placeholder="e.g. 2 Samuel 9:7"
            />
          </Field>
          <Field label="Template">
            <Select value={form.template} onChange={e => patch('template', e.target.value as GraphicContent['template'])}>
              <option value="classic">Classic (teal gradient)</option>
              <option value="modern">Modern (dark)</option>
              <option value="minimal">Minimal (light)</option>
            </Select>
          </Field>
        </div>
        <GraphicPreview raw={JSON.stringify(form)} />
      </div>
      {isDirty && (
        <AdminBtn variant="primary" onClick={() => { onSave(JSON.stringify(form)); setIsDirty(false); }}>
          Save Changes
        </AdminBtn>
      )}
    </div>
  );
}

// ─── Shorts editor ────────────────────────────────────────────────────────────

function ShortsEditor({
  asset,
  onSave,
}: {
  asset: MediaAsset;
  onSave: (content: string) => void;
}) {
  const [shorts, setShorts] = useState<SuggestedShort[]>(parseShorts(asset.content));
  const [isDirty, setIsDirty] = useState(false);

  const patch = (idx: number, k: keyof SuggestedShort, v: string) => {
    setShorts(prev => prev.map((s, i) => i === idx ? { ...s, [k]: v } : s));
    setIsDirty(true);
  };

  return (
    <div className="space-y-4">
      {shorts.map((s, i) => (
        <div key={i} className="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Clip {i + 1}</p>
          <Field label="Title">
            <TextInput value={s.title} onChange={e => patch(i, 'title', e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time"><TextInput value={s.startTime} onChange={e => patch(i, 'startTime', e.target.value)} placeholder="0:30" /></Field>
            <Field label="End Time"><TextInput value={s.endTime} onChange={e => patch(i, 'endTime', e.target.value)} placeholder="2:15" /></Field>
          </div>
          <Field label="Reason">
            <TextArea rows={2} value={s.reason} onChange={e => patch(i, 'reason', e.target.value)} />
          </Field>
          <Field label="Caption">
            <TextArea rows={2} value={s.caption} onChange={e => patch(i, 'caption', e.target.value)} />
          </Field>
          <Field label="Thumbnail Text">
            <TextInput value={s.thumbnailText} onChange={e => patch(i, 'thumbnailText', e.target.value)} />
          </Field>
        </div>
      ))}
      {isDirty && (
        <AdminBtn variant="primary" onClick={() => { onSave(JSON.stringify(shorts)); setIsDirty(false); }}>
          Save Clips
        </AdminBtn>
      )}
    </div>
  );
}

// ─── Single asset card ────────────────────────────────────────────────────────

function AssetCard({
  asset,
}: {
  asset: MediaAsset;
}) {
  const { updateAsset, advanceAssetStatus, regenerateAsset, restoreVersion } = useMediaStudio();
  const [expanded, setExpanded] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [textContent, setTextContent] = useState(asset.content);
  const [textDirty, setTextDirty] = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState<MediaAssetStatus | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const isGraphic = GRAPHIC_ASSET_TYPES.includes(asset.type);
  const isVideo = VIDEO_ASSET_TYPES.includes(asset.type);
  const next = nextStatus(asset.status);

  const handleAdvanceClick = (to: MediaAssetStatus) => {
    if (to === 'Published') { setConfirmPublish(true); return; }
    if (to === 'Approved') { setConfirmAdvance(to); return; }
    advanceAssetStatus(asset.id, to);
  };

  const handleSaveText = () => {
    regenerateAsset(asset.id, textContent);
    setTextDirty(false);
  };

  const handleScheduleDay = (day: MediaAsset['scheduledDay']) => {
    updateAsset({ ...asset, scheduledDay: day });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0"
          >
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">{ASSET_LABELS[asset.type]}</p>
            {asset.scheduledDay && (
              <p className="text-[11px] text-purple-600">📅 {asset.scheduledDay}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <StatusBadge status={asset.status} />
          {/* Step-forward button */}
          {next && next !== 'Published' && (
            <AdminBtn size="sm" variant="secondary" onClick={() => handleAdvanceClick(next)}>
              {next === 'Pastoral Review' ? 'Submit for Review' : next === 'Approved' ? 'Approve' : next}
            </AdminBtn>
          )}
          {/* Publish button always visible */}
          {asset.status !== 'Published' && (
            <AdminBtn
              size="sm"
              variant={asset.status === 'Approved' || asset.status === 'Scheduled' ? 'primary' : 'secondary'}
              onClick={() => handleAdvanceClick('Published')}
            >
              Publish
            </AdminBtn>
          )}
        </div>
      </div>

      {/* Expanded edit panel */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Schedule day */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 font-medium">Schedule for:</label>
            <Select
              className="w-40 text-xs py-1"
              value={asset.scheduledDay ?? ''}
              onChange={e => handleScheduleDay(e.target.value as MediaAsset['scheduledDay'])}
            >
              <option value="">— Not scheduled —</option>
              {SCHEDULED_DAYS.map(d => d && <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>

          {/* Content editor */}
          {isGraphic ? (
            <GraphicEditor
              asset={asset}
              onSave={(c) => regenerateAsset(asset.id, c)}
            />
          ) : isVideo ? (
            <ShortsEditor
              asset={asset}
              onSave={(c) => regenerateAsset(asset.id, c)}
            />
          ) : (
            <div className="space-y-2">
              <TextArea
                rows={10}
                value={textContent}
                onChange={e => { setTextContent(e.target.value); setTextDirty(true); }}
                className="font-mono text-xs"
              />
              {textDirty && (
                <AdminBtn variant="primary" onClick={handleSaveText}>
                  Save (creates new version)
                </AdminBtn>
              )}
            </div>
          )}

          {/* Version history */}
          <div>
            <button
              onClick={() => setShowVersions(v => !v)}
              className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1"
            >
              🕐 Version history ({asset.versions.length})
              <svg
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform ${showVersions ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {showVersions && (
              <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-3">
                {[...asset.versions].reverse().map(v => (
                  <div key={v.version} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    <span>
                      <span className="font-semibold text-gray-800">v{v.version}</span>
                      {' '}<span className="text-gray-400">— {fmtDate(v.createdAt)}</span>
                    </span>
                    {v.version !== asset.versions[asset.versions.length - 1].version && (
                      <AdminBtn
                        size="sm"
                        variant="ghost"
                        onClick={() => restoreVersion(asset.id, v.version)}
                      >
                        Restore
                      </AdminBtn>
                    )}
                    {v.version === asset.versions[asset.versions.length - 1].version && (
                      <span className="text-emerald-600 font-medium">Current</span>
                    )}
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 mt-1">
                  Restoring a version always creates a new Draft version — approved content is never silently overwritten.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {confirmAdvance && (
        <ConfirmDialog
          title={`Mark as ${confirmAdvance}?`}
          message={`This will advance the asset to "${confirmAdvance}" status. Ensure pastoral review is complete before approving.`}
          confirmLabel={confirmAdvance === 'Approved' ? 'Approve' : confirmAdvance}
          onConfirm={() => { advanceAssetStatus(asset.id, confirmAdvance); setConfirmAdvance(null); }}
          onCancel={() => setConfirmAdvance(null)}
        />
      )}
      {confirmPublish && (
        <ConfirmDialog
          title="Publish this media?"
          message={`"${ASSET_LABELS[asset.type]}" will be marked as Published and visible in reports. This requires prior approval.`}
          confirmLabel="Publish"
          onConfirm={() => {
            if (asset.status !== 'Approved' && asset.status !== 'Scheduled') {
              alert('This asset must be Approved before publishing.');
              setConfirmPublish(false);
              return;
            }
            advanceAssetStatus(asset.id, 'Published');
            setConfirmPublish(false);
          }}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
    </div>
  );
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function MediaKitEditor({ kitId, onBack }: Props) {
  const { kits, getAssetsForKit, updateKit } = useMediaStudio();
  const kit = kitId ? kits.find(k => k.id === kitId) : null;
  const [confirmKitPublish, setConfirmKitPublish] = useState(false);
  const [confirmKitAdvance, setConfirmKitAdvance] = useState<MediaAssetStatus | null>(null);

  if (!kit) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400">Media kit not found.</p>
        <AdminBtn variant="secondary" onClick={onBack}>Back</AdminBtn>
      </div>
    );
  }

  const kitAssets = getAssetsForKit(kit.id);
  const next = nextStatus(kit.status);

  const handleKitAdvance = (to: MediaAssetStatus) => {
    updateKit({ ...kit, status: to });
    setConfirmKitAdvance(null);
  };

  const groupedAssets = ASSET_GROUPS.map(g => ({
    ...g,
    assets: kitAssets.filter(a => g.types.includes(a.type as MediaAssetType)),
  })).filter(g => g.assets.length > 0);

  const draftCount = kitAssets.filter(a => a.status === 'Draft').length;
  const approvedCount = kitAssets.filter(a => a.status === 'Approved').length;
  const publishedCount = kitAssets.filter(a => a.status === 'Published').length;

  return (
    <div className="max-w-3xl">
      <div className="p-6 lg:p-8">
        <PageHeader
          title={kit.title}
          subtitle={`${kit.sourceType} · ${kit.sourceScripture}`}
          onBack={onBack}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge status={kit.status} />
              {next && next !== 'Published' && (
                <AdminBtn
                  variant="secondary"
                  onClick={() => setConfirmKitAdvance(next)}
                >
                  {next === 'Pastoral Review' ? 'Submit Kit for Review' : next === 'Approved' ? 'Approve Kit' : next}
                </AdminBtn>
              )}
              {kit.status !== 'Published' && (
                <AdminBtn
                  variant={kit.status === 'Approved' ? 'primary' : 'secondary'}
                  onClick={() => {
                    if (kit.status !== 'Approved') {
                      alert('The kit must be Approved before publishing.');
                      return;
                    }
                    setConfirmKitPublish(true);
                  }}
                >
                  Publish Kit
                </AdminBtn>
              )}
            </div>
          }
        />

        {/* Kit stats */}
        <div className="flex items-center gap-4 mb-6 text-sm">
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 flex items-center gap-3">
            <span className="text-gray-400">Assets:</span>
            <span className="font-semibold text-gray-800">{kitAssets.length}</span>
          </div>
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 flex items-center gap-3">
            <span className="text-gray-400">Draft:</span>
            <span className="font-semibold text-gray-600">{draftCount}</span>
          </div>
          <div className="bg-blue-50 rounded-lg px-4 py-2.5 flex items-center gap-3">
            <span className="text-blue-400">Approved:</span>
            <span className="font-semibold text-blue-700">{approvedCount}</span>
          </div>
          <div className="bg-emerald-50 rounded-lg px-4 py-2.5 flex items-center gap-3">
            <span className="text-emerald-400">Published:</span>
            <span className="font-semibold text-emerald-700">{publishedCount}</span>
          </div>
        </div>

        {/* Source info */}
        <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-4 mb-6 text-sm text-gray-600 space-y-1">
          <p><span className="font-medium text-gray-700">Source:</span> {kit.sourceTitle}</p>
          <p><span className="font-medium text-gray-700">Scripture:</span> {kit.sourceScripture}</p>
          {kit.sourceSummary && (
            <p className="line-clamp-2"><span className="font-medium text-gray-700">Summary:</span> {kit.sourceSummary}</p>
          )}
        </div>

        {/* Assets by group */}
        <div className="space-y-5">
          {groupedAssets.map(group => (
            <CollapsibleCard
              key={group.label}
              title={`${group.emoji} ${group.label}`}
              badge={
                <span className="text-xs text-gray-400">
                  {group.assets.length} asset{group.assets.length !== 1 ? 's' : ''}
                </span>
              }
            >
              <div className="space-y-3">
                {group.assets.map(asset => (
                  <AssetCard key={asset.id} asset={asset} />
                ))}
              </div>
            </CollapsibleCard>
          ))}
        </div>

        {/* Future AI section */}
        <div className="mt-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 p-6">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Coming Soon — AI Generation</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: '🎙️ Generate Voice', tip: 'AI-narrated devotional audio' },
              { label: '🎞️ Generate Video', tip: 'Auto-edited sermon clip' },
              { label: '📲 Generate Carousel', tip: 'Instagram carousel slides' },
              { label: '🌍 Translate', tip: 'Zulu, Afrikaans, Xhosa…' },
              { label: '♻️ Repurpose', tip: 'Adapt for another platform' },
            ].map(btn => (
              <button
                key={btn.label}
                disabled
                title={btn.tip}
                className="px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm text-gray-300 cursor-not-allowed flex items-center gap-2"
              >
                {btn.label}
                <span className="text-[9px] font-semibold text-gray-300 uppercase tracking-wide bg-gray-100 px-1.5 py-0.5 rounded">
                  Soon
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {confirmKitAdvance && (
        <ConfirmDialog
          title={`${confirmKitAdvance === 'Pastoral Review' ? 'Submit Kit for Review?' : 'Approve Kit?'}`}
          message={`This will advance the kit status to "${confirmKitAdvance}". Individual asset statuses are managed separately.`}
          confirmLabel={confirmKitAdvance === 'Pastoral Review' ? 'Submit for Review' : 'Approve'}
          onConfirm={() => handleKitAdvance(confirmKitAdvance)}
          onCancel={() => setConfirmKitAdvance(null)}
        />
      )}
      {confirmKitPublish && (
        <ConfirmDialog
          title="Publish this media kit?"
          message="The kit will be marked as Published. Individual assets still require their own approval before they are published."
          confirmLabel="Publish Kit"
          onConfirm={() => { updateKit({ ...kit, status: 'Published', updatedAt: new Date().toISOString() }); setConfirmKitPublish(false); }}
          onCancel={() => setConfirmKitPublish(false)}
        />
      )}
    </div>
  );
}
