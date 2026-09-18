export type Sermon = {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series?: string;
  scriptureReference: string;
  youtubeUrl: string;
  summary?: string;
  topics: string[];
  keywords: string[];
  audioPath?: string;
  transcript?: string;
  sermonTranscript?: string;
  sermonStartTime?: string;
  sermonEndTime?: string;
  detectionConfidence?: number;
  detectionMethod?: 'ai-auto' | 'ai-confirmed' | 'manual' | 'none';
  transcriptStatus: 'none' | 'pending' | 'complete';
  aiIndexStatus: 'none' | 'pending' | 'indexed';
  companionJourneyId?: string;
  mainTheme?: string;
  status: 'draft' | 'review' | 'published';
  pastorEdited: boolean;
  updatedAt: string;
};

export type PrayerRequest = {
  id: string;
  userId: string;
  userName: string;
  content: string;
  status: 'new' | 'acknowledged' | 'followed_up' | 'answered' | 'archived';
  privacyLevel: 'private' | 'pastoral' | 'prayer_team';
  assignedTo?: string;
  pastoralNotes?: string;
  followedUpAt?: string;
  answeredAt?: string;
  createdAt: string;
};

export type ChurchSettings = {
  churchName: string;
  tagline: string;
  contactEmail: string;
  website: string;
  youtubeChannelUrl: string;
  primaryAccentColor: string;
  defaultNotificationTime: string;
  weeklySermonCompanionEnabled: boolean;
  currentWeeklySermonCompanionId?: string;
};

export const DEFAULT_CHURCH_SETTINGS: ChurchSettings = {
  churchName: 'Isipingo Community Church',
  tagline: "It's All About JESUS.",
  contactEmail: 'info@isipingo.church',
  website: 'https://isipingo.church',
  youtubeChannelUrl: 'https://www.youtube.com/@IsiPingoCommChurch',
  primaryAccentColor: '#2a7c6f',
  defaultNotificationTime: '08:00',
  weeklySermonCompanionEnabled: true,
};