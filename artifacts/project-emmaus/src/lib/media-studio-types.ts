// ─── Media Studio — shared types ─────────────────────────────────────────────

// Scheduling removed from this sprint. Status flow: Draft → Pastoral Review → Approved.
// Publishing happens at Media Kit level only.
export type MediaAssetStatus = 'Draft' | 'Pastoral Review' | 'Approved' | 'Published';

export type MediaSourceType = 'sermon' | 'companion-journey' | 'devotional' | 'journey';

export type MediaAssetType =
  | 'instagram-square'
  | 'instagram-portrait'
  | 'facebook-graphic'
  | 'whatsapp-story'
  | 'facebook-caption'
  | 'instagram-caption'
  | 'whatsapp-message'
  | 'youtube-community'
  | 'youtube-thumbnail'
  | 'youtube-description'
  | 'audio-script'
  | 'suggested-shorts'
  | 'suggested-clips';

export const ASSET_LABELS: Record<MediaAssetType, string> = {
  'instagram-square':   'Instagram Square (1080×1080)',
  'instagram-portrait': 'Instagram Portrait (1080×1350)',
  'facebook-graphic':   'Facebook Graphic (1200×630)',
  'whatsapp-story':     'WhatsApp Story (1080×1920)',
  'facebook-caption':   'Facebook Caption',
  'instagram-caption':  'Instagram Caption',
  'whatsapp-message':   'WhatsApp Message',
  'youtube-community':  'YouTube Community Post',
  'youtube-thumbnail':  'YouTube Thumbnail Concept',
  'youtube-description':'YouTube Description & Hashtags',
  'audio-script':       'Audio Narration Script',
  'suggested-shorts':   'Suggested Shorts',
  'suggested-clips':    'Suggested Sermon Clips',
};

export type AssetGroup = {
  label: string;
  emoji: string;
  types: MediaAssetType[];
};

export const ASSET_GROUPS: AssetGroup[] = [
  { label: 'Social Graphics',   emoji: '🖼️', types: ['instagram-square', 'instagram-portrait', 'facebook-graphic', 'whatsapp-story'] },
  { label: 'Captions & Posts',  emoji: '✍️', types: ['facebook-caption', 'instagram-caption', 'whatsapp-message', 'youtube-community'] },
  { label: 'YouTube',           emoji: '▶️', types: ['youtube-thumbnail', 'youtube-description'] },
  { label: 'Audio & Scripts',   emoji: '🎙️', types: ['audio-script'] },
  { label: 'Video Suggestions', emoji: '🎬', types: ['suggested-shorts', 'suggested-clips'] },
];

export const ALL_ASSET_TYPES: MediaAssetType[] = ASSET_GROUPS.flatMap(g => g.types);

// Asset-level status progression stops at Approved. Publishing is kit-level only.
export const STATUS_ORDER: MediaAssetStatus[] = ['Draft', 'Pastoral Review', 'Approved'];

export type AssetVersion = {
  version: number;
  content: string;
  createdAt: string;
};

export type MediaAsset = {
  id: string;
  kitId: string;
  type: MediaAssetType;
  status: MediaAssetStatus;
  content: string;
  versions: AssetVersion[];
  approvedAt?: string;
  publishedAt?: string;
};

export type MediaKit = {
  id: string;
  title: string;
  sourceType: MediaSourceType;
  sourceId: string;
  sourceTitle: string;
  sourceScripture: string;
  sourceSummary: string;
  /** Stored status — only reflects Published; otherwise derived from assets. */
  status: MediaAssetStatus;
  assetIds: string[];
  /** Version number for duplicate-source kits. Starts at 1. */
  version: number;
  createdAt: string;
  updatedAt: string;
};

// Parsed from graphic asset content (JSON string)
export type GraphicContent = {
  quote: string;
  scripture: string;
  template: 'classic' | 'modern' | 'minimal';
  church: string;
  dimensions: string;
};

// Parsed from suggested-shorts / suggested-clips content (JSON array string)
export type SuggestedShort = {
  title: string;
  reason: string;
  startTime: string;
  endTime: string;
  caption: string;
  thumbnailText: string;
};

export const GRAPHIC_ASSET_TYPES: MediaAssetType[] = [
  'instagram-square', 'instagram-portrait', 'facebook-graphic', 'whatsapp-story',
];

export const VIDEO_ASSET_TYPES: MediaAssetType[] = ['suggested-shorts', 'suggested-clips'];

/**
 * Compute the derived overall status of a kit from its assets.
 * Published is stored explicitly on the kit and is never derived from assets.
 *
 * Draft    — any asset is still Draft
 * Pastoral Review — no Drafts; at least one is still Pastoral Review
 * Approved — every asset is Approved
 */
export function computeKitStatus(
  assets: MediaAsset[],
  storedStatus: MediaAssetStatus,
): MediaAssetStatus {
  if (storedStatus === 'Published') return 'Published';
  if (assets.length === 0) return 'Draft';
  if (assets.every(a => a.status === 'Approved')) return 'Approved';
  if (assets.some(a => a.status === 'Draft')) return 'Draft';
  return 'Pastoral Review';
}
