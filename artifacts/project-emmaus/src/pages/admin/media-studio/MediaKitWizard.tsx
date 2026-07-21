import React, { useState } from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { useMediaStudio } from '@/contexts/MediaStudioContext';
import { useAdmin } from '@/contexts/AdminContext';
import {
  ALL_ASSET_TYPES, ASSET_GROUPS, ASSET_LABELS,
  type MediaAssetType, type MediaSourceType,
} from '@/lib/media-studio-types';
import type { MediaKit, MediaAsset } from '@/lib/media-studio-types';
import {
  generateGraphicContent,
  generateFacebookCaption,
  generateInstagramCaption,
  generateWhatsAppMessage,
  generateYouTubeCommunityPost,
  generateYouTubeThumbnailConcept,
  generateYouTubeDescription,
  generateAudioScript,
  generateSuggestedShorts,
} from '@/lib/media-studio-demo-data';
import { AdminBtn, Field, Select, PageHeader } from '../shared';

type Props = {
  onBack: () => void;
  onCreated: (kitId: string) => void;
};

type SourceOption = {
  id: string;
  label: string;
  scripture: string;
  summary: string;
  extra?: { speaker?: string; topics?: string[] };
};

const QUOTE_FROM = (title: string) =>
  `[Edit this quote for "${title}" before publishing]`;

// Generate content for a single asset type given source context
function buildAssetContent(
  type: MediaAssetType,
  title: string,
  scripture: string,
  summary: string,
  extra?: { speaker?: string; topics?: string[] },
): string {
  const speaker = extra?.speaker ?? 'Isipingo Community Church';
  const topics = extra?.topics ?? ['faith', 'grace', 'community'];
  const quote = QUOTE_FROM(title);

  switch (type) {
    case 'instagram-square':
      return generateGraphicContent(quote, scripture, '1080×1080', 'classic');
    case 'instagram-portrait':
      return generateGraphicContent(quote, scripture, '1080×1350', 'modern');
    case 'facebook-graphic':
      return generateGraphicContent(quote, scripture, '1200×630', 'minimal');
    case 'whatsapp-story':
      return generateGraphicContent(quote, scripture, '1080×1920', 'classic');
    case 'facebook-caption':
      return generateFacebookCaption(title, scripture, summary);
    case 'instagram-caption':
      return generateInstagramCaption(title, scripture);
    case 'whatsapp-message':
      return generateWhatsAppMessage(title, scripture, summary);
    case 'youtube-community':
      return generateYouTubeCommunityPost(title, scripture);
    case 'youtube-thumbnail':
      return generateYouTubeThumbnailConcept(title, speaker);
    case 'youtube-description':
      return generateYouTubeDescription(title, speaker, scripture, summary, topics);
    case 'audio-script':
      return generateAudioScript(title, scripture, summary);
    case 'suggested-shorts':
    case 'suggested-clips':
      return JSON.stringify(generateSuggestedShorts(title, scripture));
    default:
      return '[Content to be edited]';
  }
}

export default function MediaKitWizard({ onBack, onCreated }: Props) {
  const { journeys } = useJourney();
  const { sermons } = useAdmin();
  const { addKit, addAsset } = useMediaStudio();

  const [step, setStep] = useState<1 | 2>(1);
  const [sourceType, setSourceType] = useState<MediaSourceType>('sermon');
  const [sourceId, setSourceId] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<MediaAssetType>>(new Set(ALL_ASSET_TYPES));
  const [generating, setGenerating] = useState(false);

  // Build source options depending on chosen type
  const sourceOptions: SourceOption[] = (() => {
    if (sourceType === 'sermon') {
      return sermons.map(s => ({
        id: s.id,
        label: s.title,
        scripture: s.scriptureReference,
        summary: s.summary ?? '',
        extra: { speaker: s.speaker, topics: s.topics },
      }));
    }
    if (sourceType === 'companion-journey' || sourceType === 'journey' || sourceType === 'devotional') {
      return journeys
        .filter(j => {
          if (sourceType === 'companion-journey') return j.journeyType === 'companion';
          if (sourceType === 'devotional') return j.journeyType === 'devotional';
          return j.journeyType === 'journey' || !j.journeyType;
        })
        .map(j => ({
          id: j.id,
          label: j.title,
          scripture: j.sermon?.scriptureReference ?? '',
          summary: j.description ?? '',
        }));
    }
    return [];
  })();

  const selectedSource = sourceOptions.find(o => o.id === sourceId);

  const toggleType = (t: MediaAssetType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });
  };

  const toggleGroup = (types: MediaAssetType[]) => {
    const allOn = types.every(t => selectedTypes.has(t));
    setSelectedTypes(prev => {
      const next = new Set(prev);
      types.forEach(t => allOn ? next.delete(t) : next.add(t));
      return next;
    });
  };

  const handleGenerate = () => {
    if (!selectedSource || selectedTypes.size === 0) return;
    setGenerating(true);

    const kitId = `ms-kit-${Date.now()}`;
    const assetTypes = [...selectedTypes];
    const assetIds: string[] = [];

    assetTypes.forEach(type => {
      const assetId = `ms-asset-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      assetIds.push(assetId);
      const content = buildAssetContent(
        type,
        selectedSource.label,
        selectedSource.scripture,
        selectedSource.summary,
        selectedSource.extra,
      );
      const asset: MediaAsset = {
        id: assetId,
        kitId,
        type,
        status: 'Draft', // ALWAYS Draft — never auto-publish
        content,
        versions: [{ version: 1, content, createdAt: new Date().toISOString() }],
      };
      addAsset(asset);
    });

    const kit: MediaKit = {
      id: kitId,
      title: `Media Kit: ${selectedSource.label}`,
      sourceType,
      sourceId: selectedSource.id,
      sourceTitle: selectedSource.label,
      sourceScripture: selectedSource.scripture,
      sourceSummary: selectedSource.summary,
      status: 'Draft', // ALWAYS Draft
      assetIds,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    addKit(kit);

    setGenerating(false);
    onCreated(kitId);
  };

  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <PageHeader
        title="Create Media Kit"
        subtitle={step === 1 ? 'Step 1 of 2 — Choose source' : 'Step 2 of 2 — Select assets'}
        onBack={step === 1 ? onBack : () => setStep(1)}
      />

      {step === 1 && (
        <div className="space-y-6">
          {/* Source type */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Content Source</h2>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 'sermon',             label: '📹 Sermon' },
                  { value: 'companion-journey',   label: '🤝 Companion Journey' },
                  { value: 'journey',             label: '🗺️ Journey' },
                  { value: 'devotional',          label: '📖 Devotional' },
                ] as { value: MediaSourceType; label: string }[]
              ).map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setSourceType(opt.value); setSourceId(''); }}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium text-left transition-colors ${
                    sourceType === opt.value
                      ? 'border-teal-600 bg-teal-50 text-teal-800'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Specific source */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
            <Field label="Select source">
              {sourceOptions.length === 0 ? (
                <p className="text-sm text-gray-400">
                  No {sourceType.replace(/-/g, ' ')}s found. Create one first.
                </p>
              ) : (
                <Select value={sourceId} onChange={e => setSourceId(e.target.value)}>
                  <option value="">— Choose —</option>
                  {sourceOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </Select>
              )}
            </Field>

            {selectedSource && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-1 text-sm text-gray-600">
                <p><span className="font-medium text-gray-700">Title:</span> {selectedSource.label}</p>
                {selectedSource.scripture && (
                  <p><span className="font-medium text-gray-700">Scripture:</span> {selectedSource.scripture}</p>
                )}
                {selectedSource.summary && (
                  <p className="line-clamp-2"><span className="font-medium text-gray-700">Summary:</span> {selectedSource.summary}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <AdminBtn
              variant="primary"
              disabled={!sourceId}
              onClick={() => setStep(2)}
            >
              Next: Select Assets →
            </AdminBtn>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            ⚠️ All generated assets start as <strong>Draft</strong>. Nothing will be published automatically.
          </div>

          {/* Asset type selection */}
          {ASSET_GROUPS.map(group => {
            const allOn = group.types.every(t => selectedTypes.has(t));
            return (
              <div key={group.label} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">{group.emoji} {group.label}</span>
                  <button
                    onClick={() => toggleGroup(group.types)}
                    className="text-xs text-teal-700 hover:underline font-medium"
                  >
                    {allOn ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="px-5 py-4 space-y-2">
                  {group.types.map(type => (
                    <label key={type} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedTypes.has(type)}
                        onChange={() => toggleType(type)}
                        className="w-4 h-4 rounded border-gray-300 text-teal-600 accent-teal-600"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-gray-900">
                        {ASSET_LABELS[type]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-gray-500">
              {selectedTypes.size} asset{selectedTypes.size !== 1 ? 's' : ''} selected
            </span>
            <AdminBtn
              variant="primary"
              disabled={selectedTypes.size === 0 || generating}
              onClick={handleGenerate}
            >
              {generating ? 'Generating…' : `✨ Generate ${selectedTypes.size} Asset${selectedTypes.size !== 1 ? 's' : ''}`}
            </AdminBtn>
          </div>
        </div>
      )}
    </div>
  );
}
