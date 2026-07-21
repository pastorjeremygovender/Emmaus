import React, { useState } from 'react';
import { useMediaStudio } from '@/contexts/MediaStudioContext';
import {
  ASSET_LABELS, GRAPHIC_ASSET_TYPES, VIDEO_ASSET_TYPES, STATUS_ORDER, computeKitStatus,
  type MediaAsset, type MediaAssetStatus, type MediaAssetType, type SuggestedShort,
} from '@/lib/media-studio-types';
import type { GraphicContent } from '@/lib/media-studio-types';
import {
  StatusBadge, AdminBtn, ConfirmDialog, Field, TextArea, TextInput, Select, PageHeader,
} from '../shared';
import GraphicPreview from './GraphicPreview';

type Props = {
  kitId: string | null;
  onBack: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nextAssetStatus(current: MediaAssetStatus): MediaAssetStatus | null {
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

function GraphicEditor({ asset, onSave }: { asset: MediaAsset; onSave: (c: string) => void }) {
  const gc = parseGraphic(asset.content) ?? {
    quote: '', scripture: '', template: 'classic' as const,
    church: 'Isipingo Community Church', dimensions: '1080×1080',
  };
  const [form, setForm]     = useState(gc);
  const [isDirty, setDirty] = useState(false);
  const patch = (k: keyof GraphicContent, v: string) => { setForm(f => ({ ...f, [k]: v })); setDirty(true); };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Field label="Quote">
            <TextArea rows={3} value={form.quote} onChange={e => patch('quote', e.target.value)} placeholder="Quote or key takeaway…" />
          </Field>
          <Field label="Scripture Reference">
            <TextInput value={form.scripture} onChange={e => patch('scripture', e.target.value)} placeholder="e.g. 2 Samuel 9:7" />
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
        <AdminBtn variant="primary" onClick={() => { onSave(JSON.stringify(form)); setDirty(false); }}>
          Save Changes
        </AdminBtn>
      )}
    </div>
  );
}

// ─── Shorts / clips editor ────────────────────────────────────────────────────

function ShortsEditor({ asset, onSave }: { asset: MediaAsset; onSave: (c: string) => void }) {
  const [shorts, setShorts] = useState<SuggestedShort[]>(parseShorts(asset.content));
  const [isDirty, setDirty] = useState(false);
  const patch = (idx: number, k: keyof SuggestedShort, v: string) => {
    setShorts(prev => prev.map((s, i) => i === idx ? { ...s, [k]: v } : s));
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      {shorts.map((s, i) => (
        <div key={i} className="bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Clip {i + 1}</p>
          <Field label="Title"><TextInput value={s.title} onChange={e => patch(i, 'title', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time"><TextInput value={s.startTime} onChange={e => patch(i, 'startTime', e.target.value)} placeholder="0:30" /></Field>
            <Field label="End Time"><TextInput value={s.endTime} onChange={e => patch(i, 'endTime', e.target.value)} placeholder="2:15" /></Field>
          </div>
          <Field label="Reason"><TextArea rows={2} value={s.reason} onChange={e => patch(i, 'reason', e.target.value)} /></Field>
          <Field label="Caption"><TextArea rows={2} value={s.caption} onChange={e => patch(i, 'caption', e.target.value)} /></Field>
          <Field label="Thumbnail Text"><TextInput value={s.thumbnailText} onChange={e => patch(i, 'thumbnailText', e.target.value)} /></Field>
        </div>
      ))}
      {isDirty && (
        <AdminBtn variant="primary" onClick={() => { onSave(JSON.stringify(shorts)); setDirty(false); }}>
          Save Clips
        </AdminBtn>
      )}
    </div>
  );
}

// ─── Asset Review page ────────────────────────────────────────────────────────

function AssetReview({
  asset,
  onBack,
}: {
  asset: MediaAsset;
  onBack: () => void;
}) {
  const { updateAsset, advanceAssetStatus, regenerateAsset, restoreVersion } = useMediaStudio();
  const [textContent, setTextContent]     = useState(asset.content);
  const [textDirty, setTextDirty]         = useState(false);
  const [showVersions, setShowVersions]   = useState(false);
  const [confirmAdvance, setConfirmAdvance] = useState<MediaAssetStatus | null>(null);
  const [confirmRegen, setConfirmRegen]   = useState(false);

  const isGraphic = GRAPHIC_ASSET_TYPES.includes(asset.type);
  const isVideo   = VIDEO_ASSET_TYPES.includes(asset.type);
  const next      = nextAssetStatus(asset.status);

  const handleSaveDraft = () => {
    regenerateAsset(asset.id, textContent);
    setTextDirty(false);
  };

  const actionLabel = (status: MediaAssetStatus) => {
    if (status === 'Pastoral Review') return 'Submit for Pastoral Review';
    if (status === 'Approved')        return 'Approve';
    return status;
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-gray-400 hover:text-gray-700 flex items-center gap-1.5 text-sm">
          ← Back to kit
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-[18px] font-semibold text-gray-900">{ASSET_LABELS[asset.type]}</h1>
        <StatusBadge status={asset.status} />
      </div>

      {/* Content editor */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Content</h2>
        {isGraphic ? (
          <GraphicEditor asset={asset} onSave={(c) => regenerateAsset(asset.id, c)} />
        ) : isVideo ? (
          <ShortsEditor asset={asset} onSave={(c) => regenerateAsset(asset.id, c)} />
        ) : (
          <div className="space-y-3">
            <TextArea
              rows={12}
              value={textContent}
              onChange={e => { setTextContent(e.target.value); setTextDirty(true); }}
              className="font-mono text-xs"
            />
            <div className="flex gap-2">
              {textDirty && (
                <AdminBtn variant="primary" onClick={handleSaveDraft}>
                  Save Draft
                </AdminBtn>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Workflow actions — no Publish here */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Review Actions</h2>
        <div className="flex flex-wrap gap-3">
          {/* Regenerate — resets to Draft */}
          <AdminBtn
            variant="secondary"
            onClick={() => setConfirmRegen(true)}
          >
            ↺ Regenerate (resets to Draft)
          </AdminBtn>

          {/* Next status step — stops at Approved */}
          {next && (
            <AdminBtn
              variant={next === 'Approved' ? 'primary' : 'secondary'}
              onClick={() => setConfirmAdvance(next)}
            >
              {actionLabel(next)}
            </AdminBtn>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Publishing happens at the Media Kit level, not per asset.
        </p>
      </div>

      {/* Version history */}
      <div className="bg-white rounded-xl border border-gray-200 px-6 py-5">
        <button
          onClick={() => setShowVersions(v => !v)}
          className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-2 font-medium"
        >
          🕐 Version history ({asset.versions.length})
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${showVersions ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {showVersions && (
          <div className="mt-3 space-y-2 pt-3 border-t border-gray-100">
            {[...asset.versions].reverse().map(v => (
              <div key={v.version} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                <span>
                  <span className="font-semibold text-gray-800">v{v.version}</span>
                  {' '}<span className="text-gray-400">— {fmtDate(v.createdAt)}</span>
                </span>
                {v.version !== asset.versions[asset.versions.length - 1].version ? (
                  <AdminBtn size="sm" variant="ghost" onClick={() => restoreVersion(asset.id, v.version)}>
                    Restore
                  </AdminBtn>
                ) : (
                  <span className="text-emerald-600 font-medium">Current</span>
                )}
              </div>
            ))}
            <p className="text-[10px] text-gray-400 mt-1">
              Restoring always creates a new Draft version. Approved content is never silently overwritten.
            </p>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {confirmAdvance && (
        <ConfirmDialog
          title={`${actionLabel(confirmAdvance)}?`}
          message={`This will advance the asset to "${confirmAdvance}" status.${confirmAdvance === 'Approved' ? ' Ensure pastoral review is complete before approving.' : ''}`}
          confirmLabel={actionLabel(confirmAdvance)}
          onConfirm={() => { advanceAssetStatus(asset.id, confirmAdvance); setConfirmAdvance(null); onBack(); }}
          onCancel={() => setConfirmAdvance(null)}
        />
      )}
      {confirmRegen && (
        <ConfirmDialog
          title="Regenerate this asset?"
          message="The content will be replaced with a fresh draft and status will reset to Draft. The current version is saved in history."
          confirmLabel="Regenerate"
          onConfirm={() => {
            // Regenerate by re-saving current content as new Draft version
            regenerateAsset(asset.id, asset.content);
            setConfirmRegen(false);
            onBack();
          }}
          onCancel={() => setConfirmRegen(false)}
        />
      )}
    </div>
  );
}

// ─── Kit workspace ─────────────────────────────────────────────────────────────

export default function MediaKitEditor({ kitId, onBack }: Props) {
  const { kits, assets, getAssetsForKit, updateKit, advanceAssetStatus } = useMediaStudio();
  const kit = kitId ? kits.find(k => k.id === kitId) : null;

  const [reviewingAssetId, setReviewingAssetId] = useState<string | null>(null);
  const [confirmPublish,   setConfirmPublish]   = useState(false);

  if (!kit) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-400 mb-4">Media kit not found.</p>
        <AdminBtn variant="secondary" onClick={onBack}>Back</AdminBtn>
      </div>
    );
  }

  const kitAssets  = getAssetsForKit(kit.id);
  const derived    = computeKitStatus(kitAssets, kit.status);

  // If reviewing a single asset, show its review page
  if (reviewingAssetId) {
    const reviewAsset = kitAssets.find(a => a.id === reviewingAssetId);
    if (reviewAsset) {
      return (
        <AssetReview
          asset={reviewAsset}
          onBack={() => setReviewingAssetId(null)}
        />
      );
    }
    // Asset not found (shouldn't happen)
    setReviewingAssetId(null);
  }

  // ── Kit-level workflow button availability ──────────────────────────────────
  const draftCount      = kitAssets.filter(a => a.status === 'Draft').length;
  const reviewCount     = kitAssets.filter(a => a.status === 'Pastoral Review').length;
  const approvedCount   = kitAssets.filter(a => a.status === 'Approved').length;
  const allInReview     = kitAssets.length > 0 && kitAssets.every(a => a.status === 'Pastoral Review');
  const allApproved     = kitAssets.length > 0 && kitAssets.every(a => a.status === 'Approved');
  const canSubmitAll    = draftCount > 0 && kit.status !== 'Published';
  const canApproveAll   = allInReview && kit.status !== 'Published';
  const canPublish      = allApproved && kit.status !== 'Published';

  const handleSubmitAll = () => {
    kitAssets.filter(a => a.status === 'Draft').forEach(a => advanceAssetStatus(a.id, 'Pastoral Review'));
  };

  const handleApproveAll = () => {
    kitAssets.filter(a => a.status === 'Pastoral Review').forEach(a => advanceAssetStatus(a.id, 'Approved'));
  };

  const handlePublish = () => {
    // Publish the kit and all assets
    kitAssets.forEach(a => advanceAssetStatus(a.id, 'Published'));
    updateKit({ ...kit, status: 'Published', updatedAt: new Date().toISOString() });
    setConfirmPublish(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <PageHeader
        title={`Media Kit — ${kit.sourceTitle}${kit.version > 1 ? ` (v${kit.version})` : ''}`}
        subtitle={`${kit.sourceType.replace(/-/g, ' ')} · ${kit.sourceScripture}`}
        onBack={onBack}
        action={<StatusBadge status={derived} />}
      />

      {/* Source */}
      <div className="bg-gray-50 rounded-xl border border-gray-100 px-5 py-4 mb-6 text-sm text-gray-600 space-y-1">
        <p><span className="font-medium text-gray-700">Source:</span> {kit.sourceTitle}</p>
        <p><span className="font-medium text-gray-700">Scripture:</span> {kit.sourceScripture}</p>
        {kit.sourceSummary && (
          <p className="line-clamp-2">
            <span className="font-medium text-gray-700">Summary:</span> {kit.sourceSummary}
          </p>
        )}
      </div>

      {/* Asset list — flat, no grouping */}
      <h2 className="text-sm font-semibold text-gray-700 mb-3">
        Assets ({kitAssets.length})
      </h2>

      {kitAssets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm mb-6">
          No assets in this kit.
        </div>
      ) : (
        <div className="space-y-2 mb-8">
          {kitAssets.map(asset => (
            <div
              key={asset.id}
              className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {ASSET_LABELS[asset.type as MediaAssetType]}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={asset.status} />
                {kit.status !== 'Published' && (
                  <AdminBtn
                    size="sm"
                    variant="secondary"
                    onClick={() => setReviewingAssetId(asset.id)}
                  >
                    Review →
                  </AdminBtn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Kit-level workflow — bottom of workspace */}
      {kit.status !== 'Published' && kitAssets.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 px-6 py-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Kit Workflow</h2>
          <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-4 flex-wrap">
            <span>{draftCount} Draft</span>·
            <span>{reviewCount} Pastoral Review</span>·
            <span>{approvedCount} Approved</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <AdminBtn
              variant="secondary"
              disabled={!canSubmitAll}
              onClick={handleSubmitAll}
            >
              Submit All for Review
            </AdminBtn>
            <AdminBtn
              variant="secondary"
              disabled={!canApproveAll}
              onClick={handleApproveAll}
            >
              Approve All
            </AdminBtn>
            <AdminBtn
              variant={canPublish ? 'primary' : 'secondary'}
              disabled={!canPublish}
              onClick={() => setConfirmPublish(true)}
            >
              Publish Media Kit
            </AdminBtn>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Submit All → advances all Drafts to Pastoral Review.<br />
            Approve All → available when every asset is in Pastoral Review.<br />
            Publish → available only when every asset is Approved. Requires confirmation.
          </p>
        </div>
      )}

      {kit.status === 'Published' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-4 text-sm text-emerald-800 font-medium">
          ✅ This media kit has been published.
        </div>
      )}

      {/* Publish confirmation */}
      {confirmPublish && (
        <ConfirmDialog
          title="Publish this media kit?"
          message="Every asset will be marked as Published. This cannot be undone automatically. Please confirm pastoral approval is complete."
          confirmLabel="Publish Media Kit"
          onConfirm={handlePublish}
          onCancel={() => setConfirmPublish(false)}
        />
      )}
    </div>
  );
}
