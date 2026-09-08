import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Walk from '../Walk';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  loadRooms: vi.fn(() => Promise.resolve()),
  getMyRooms: vi.fn(() => [{
    id: 'room-1',
    name: 'Tuesday Bible Group',
    leaderNote: '',
    memberCount: 4,
    adminName: 'Grace',
  }]),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/', mocks.setLocation],
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'member-1', role: 'member', preferredName: 'Grace' } }),
}));

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    journeys: [],
    progress: {},
    loading: false,
    getStepsForJourney: () => [],
    dailyRhythmState: undefined,
  }),
}));

vi.mock('@/contexts/RoomsContext', () => ({
  useRooms: () => ({
    getMyRooms: mocks.getMyRooms,
    loadRooms: mocks.loadRooms,
  }),
}));

vi.mock('@/lib/enrollment', () => ({
  useEnrollment: () => ({ getState: () => 'active' }),
}));

vi.mock('@/lib/devotionals-api', () => ({
  getAllProgress: vi.fn(() => Promise.resolve([])),
  listPublishedSeries: vi.fn(() => Promise.resolve([])),
  getSeriesWithEntries: vi.fn(() => Promise.resolve({ entries: [] })),
  startSeries: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/collections-api', () => ({
  listCollections: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/daily-rhythm-calendar', () => ({
  resolveDailyRhythmCalendar: () => null,
  publishedDailyRhythmStep: () => null,
}));

vi.mock('@/lib/todays-journey-projection', () => ({
  projectTodaysJourneys: () => ({
    standaloneWalks: [],
    standaloneJourneys: [],
    collectionCards: [],
  }),
}));

vi.mock('@/lib/badge-api', () => ({
  dismissBadge: vi.fn(() => Promise.resolve()),
  computeUpdatedBadge: () => null,
}));

vi.mock('@/lib/dev-mode', () => ({
  isDevelopmentMode: () => false,
}));

vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/UnifiedEmmausInput', () => ({ UnifiedEmmausInput: () => null }));
vi.mock('@/components/MemberHeaderActions', () => ({ MemberHeaderActions: () => null }));
vi.mock('@/components/DevModeBanner', () => ({ DevModeBanner: () => null }));

describe("Walk — My Groups dismissal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })));
  });

  it("removes the group card without opening the group", () => {
    render(<Walk />);

    expect(screen.getByText('Tuesday Bible Group')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "Remove from Today's Steps" }));

    expect(screen.queryByText('Tuesday Bible Group')).not.toBeInTheDocument();
    expect(mocks.setLocation).not.toHaveBeenCalled();
  });
});