// ─── Admin-specific types ────────────────────────────────────────────────────

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
  /** Full church-service transcript (retained for reference) */
  transcript?: string;
  /** Sermon-only transcript — canonical source for all AI generation */
  sermonTranscript?: string;
  sermonStartTime?: string;     // "HH:MM:SS" or "" if untimed
  sermonEndTime?: string;       // "HH:MM:SS" or "" if untimed
  detectionConfidence?: number; // 0.0 → 1.0
  detectionMethod?: 'ai-auto' | 'ai-confirmed' | 'manual' | 'none';
  transcriptStatus: 'none' | 'pending' | 'complete';
  aiIndexStatus: 'none' | 'pending' | 'indexed';
  companionJourneyId?: string;
  /** Pastor-confirmed one-sentence Big Idea — canonical theme for the companion */
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

export type AdminUser = {
  id: string;
  email: string;
  preferredName: string;
  role: 'user' | 'admin';
  currentJourneyId?: string;
  currentDay?: number;
  daysWalking: number;
  lastActiveAt: string;
  completedJourneys: string[];
  prayerRequestCount: number;
  reflectionCount: number;
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
  /** Journey ID of the companion currently marked as "This Week's Sermon". */
  currentWeeklySermonCompanionId?: string;
};

export type RecentActivity = {
  id: string;
  text: string;
  time: string;
  type: 'progress' | 'prayer' | 'published' | 'user' | 'journey';
};

// ─── Seed data ───────────────────────────────────────────────────────────────

export const DEMO_JOHN_SERMON: Sermon = {
  id: 'sermon-john-3',
  title: 'Born Again: The Night Nicodemus Met Jesus',
  speaker: 'Pastor Jeremy Govender',
  sermonDate: '2024-09-15',
  series: 'Gospel of John',
  scriptureReference: 'John 3:1–21',
  youtubeUrl: 'https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID',
  summary: 'Jesus tells Nicodemus something that changes everything: "You must be born again." What does it mean, and why does it matter for you today?',
  topics: ['salvation', 'rebirth', 'Holy Spirit', 'John 3:16'],
  keywords: ['Nicodemus', 'born again', 'John 3:16', 'Spirit', 'eternal life'],
  transcriptStatus: 'none',
  aiIndexStatus: 'none',
  status: 'published',
  pastorEdited: true,
  updatedAt: new Date().toISOString(),
};

export const DEMO_SERMON_RECORD: Sermon = {
  id: 'sermon-2-samuel-9',
  title: "God's Kindness Restores the Broken",
  speaker: 'Pastor Jeremy Govender',
  sermonDate: '2024-11-10',
  series: 'Stories of Grace',
  scriptureReference: '2 Samuel 9',
  youtubeUrl: 'https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID',
  summary:
    "Exploring how God's covenant kindness reaches those who feel most broken and unworthy, through the story of Mephibosheth.",
  topics: ['grace', 'restoration', 'identity', 'belonging'],
  keywords: ['Mephibosheth', 'David', 'covenant', 'Lo Debar', 'kindness'],
  transcriptStatus: 'none',
  aiIndexStatus: 'none',
  companionJourneyId: 'gods-kindness-restores-the-broken',
  status: 'published',
  pastorEdited: true,
  updatedAt: new Date().toISOString(),
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

export const DEMO_PRAYER_REQUESTS: PrayerRequest[] = [
  {
    id: 'prayer-1',
    userId: 'demo-user-1',
    userName: 'Friend',
    content:
      'Please pray for my family situation. Things have been difficult at home and I need wisdom.',
    status: 'new',
    privacyLevel: 'pastoral',
    createdAt: daysAgo(2),
  },
  {
    id: 'prayer-2',
    userId: 'demo-user-2',
    userName: 'Sarah',
    content: 'Struggling with anxiety about a new job. Asking for peace and clarity.',
    status: 'acknowledged',
    privacyLevel: 'private',
    createdAt: daysAgo(5),
  },
  {
    id: 'prayer-3',
    userId: 'demo-user-3',
    userName: 'Michael',
    content:
      'My mother is in hospital. Please pray for her recovery and for our whole family during this time.',
    status: 'followed_up',
    privacyLevel: 'prayer_team',
    assignedTo: 'Pastor Jeremy',
    followedUpAt: daysAgo(1),
    createdAt: daysAgo(7),
  },
];

export const DEMO_ADMIN_USERS: AdminUser[] = [
  {
    id: 'demo-user-1',
    email: 'demo@emmaus.church',
    preferredName: 'Friend',
    role: 'user',
    currentJourneyId: '15-minutes-with-jesus',
    currentDay: 3,
    daysWalking: 14,
    lastActiveAt: now.toISOString(),
    completedJourneys: [],
    prayerRequestCount: 1,
    reflectionCount: 2,
  },
  {
    id: 'demo-user-2',
    email: 'sarah@example.com',
    preferredName: 'Sarah',
    role: 'user',
    currentJourneyId: 'gods-kindness-restores-the-broken',
    currentDay: 2,
    daysWalking: 7,
    lastActiveAt: daysAgo(1),
    completedJourneys: ['15-minutes-with-jesus'],
    prayerRequestCount: 1,
    reflectionCount: 5,
  },
  {
    id: 'demo-user-3',
    email: 'michael@example.com',
    preferredName: 'Michael',
    role: 'user',
    currentJourneyId: '15-minutes-with-jesus',
    currentDay: 5,
    daysWalking: 21,
    lastActiveAt: daysAgo(2),
    completedJourneys: [],
    prayerRequestCount: 1,
    reflectionCount: 4,
  },
];

export const DEMO_CHURCH_SETTINGS: ChurchSettings = {
  churchName: 'Isipingo Community Church',
  tagline: "It's All About JESUS.",
  contactEmail: 'info@isipingo.church',
  website: 'https://isipingo.church',
  youtubeChannelUrl: 'https://www.youtube.com/@IsiPingoCommChurch',
  primaryAccentColor: '#2a7c6f',
  defaultNotificationTime: '08:00',
  weeklySermonCompanionEnabled: true,
};

export const DEMO_RECENT_ACTIVITY: RecentActivity[] = [
  { id: 'a1', text: 'Michael completed Day 4 of 10 Minutes with Jesus', time: '2h ago', type: 'progress' },
  { id: 'a2', text: 'New prayer request received from Friend', time: '3h ago', type: 'prayer' },
  { id: 'a3', text: "Sarah started God's Kindness Restores the Broken", time: '1d ago', type: 'progress' },
  {
    id: 'a4',
    text: "Companion Journey published: God's Kindness Restores the Broken",
    time: '3d ago',
    type: 'published',
  },
  { id: 'a5', text: 'New user registered: Sarah', time: '7d ago', type: 'user' },
];
