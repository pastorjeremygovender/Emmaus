export interface VoiceReadingProgress {
  userId: string;
  resourceType: 'bible' | 'daily-rhythm' | 'devotional' | 'walk' | 'sermon-companion';
  resourceId: string;
  parentResourceId?: string;
  translationId?: string;
  bookId?: string;
  chapter?: number;
  verse?: number;
  segmentId: string;
  sectionIndex: number;
  sectionsTotal: number;
  provider: 'elevenlabs' | 'openai' | 'recorded';
  providerTimeSeconds?: number;
  updatedAt: string;
  completed: boolean;
}

const KEY_PREFIX = 'emmaus_reading_progress_v1:';

function key(userId: string) {
  return `${KEY_PREFIX}${encodeURIComponent(userId)}`;
}

export function loadVoiceReadingProgress(userId: string): VoiceReadingProgress | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as VoiceReadingProgress;
    if (value.userId !== userId || !value.resourceType || !value.segmentId) return null;
    return value;
  } catch {
    return null;
  }
}

export function saveVoiceReadingProgress(progress: VoiceReadingProgress): void {
  try { localStorage.setItem(key(progress.userId), JSON.stringify(progress)); } catch { /* storage is optional */ }
}

export function clearVoiceReadingProgress(userId: string): void {
  try { localStorage.removeItem(key(userId)); } catch { /* storage is optional */ }
}