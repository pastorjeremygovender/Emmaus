import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Journeys from '../Journeys';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  startJourney: vi.fn(() => Promise.resolve()),
  startSeries: vi.fn(() => Promise.resolve()),
  fetchNextSteps: vi.fn(),
}));

const { setLocation, startJourney, startSeries } = mocks;

const walk = {
  id: 'walk-1',
  contentType: 'journey',
  title: 'A Walk of Trust',
  description: 'A guided walk.',
  memberProgressState: 'not-started',
  metadata: { durationDays: 5 },
  route: '/journey/walk-1/day/1',
  primaryActionLabel: 'Continue',
};

const devotional = {
  id: 'devotional-1',
  contentType: 'daily-devotional',
  title: 'Learning to Pray',
  description: 'A daily practice.',
  memberProgressState: 'not-started',
  metadata: { durationDays: 5 },
  route: '/devotional/devotional-1/day/1',
  primaryActionLabel: 'Continue',
};

const companion = {
  id: 'companion-1',
  contentType: 'sermon-devotional',
  title: 'Jesus at the Center',
  description: 'A five-step companion.',
  memberProgressState: 'not-started',
  metadata: { durationDays: 5 },
  route: '/sermon-companion/companion-1/overview',
  primaryActionLabel: 'Continue',
};

const earlierCompanion = {
  ...companion,
  id: 'companion-2',
  title: 'Made Free',
  route: '/sermon-companion/companion-2/overview',
  metadata: { durationDays: 5, displayOrder: 1 },
};

const laterCompanion = {
  ...companion,
  id: 'companion-3',
  title: 'When the Pressure Builds',
  route: '/sermon-companion/companion-3/overview',
  metadata: { durationDays: 5, displayOrder: 0 },
};

const data = {
  dailyDevotionals: [devotional],
  journeyCollections: [],
  standaloneJourneys: [walk],
  currentSermonCompanion: companion,
  previousSermonCompanions: [earlierCompanion, laterCompanion],
  contentGroups: [],
};

vi.mock('wouter', () => ({
  useLocation: () => ['/journeys', setLocation],
}));

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    journeys: [{
      id: 'walk-1',
      title: walk.title,
      status: 'Published',
      journeyType: 'walk',
      durationDays: 5,
      overloadExempt: false,
    }],
    progress: {},
    startJourney,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'member-1', role: 'member' } }),
}));

vi.mock('@/contexts/RoomsContext', () => ({
  useRooms: () => ({
    getMyRooms: () => [],
    loadRooms: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock('@/lib/enrollment', () => ({
  useEnrollment: () => ({
    getState: () => 'active',
    pauseJourney: vi.fn(),
    canActivateMore: () => true,
  }),
  isExemptJourney: () => false,
}));

vi.mock('@/lib/daily-gate', () => ({
  useDailyGate: () => ({ gateClear: true }),
}));

vi.mock('@/lib/next-steps-api', () => ({
  fetchNextSteps: mocks.fetchNextSteps,
  startSeries: mocks.startSeries,
  resumeEngagement: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/content-navigation', () => ({
  navigatorRoute: () => null,
}));

vi.mock('@/lib/badge-api', () => ({
  dismissBadge: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/rooms-api', () => ({
  apiStartShared: vi.fn(() => Promise.resolve({ roomId: 'room-1' })),
}));

vi.mock('@/components/JourneyStartSheet', () => ({
  default: ({ onStartAlone }: { onStartAlone: () => Promise<void> }) => (
    <button onClick={onStartAlone}>On my own</button>
  ),
}));

vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/UnifiedEmmausInput', () => ({ UnifiedEmmausInput: () => null }));

describe('Discovery content activation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.fetchNextSteps.mockResolvedValue(data);
  });

  it('opens a discovered standalone walk at its detail page', async () => {
    render(<Journeys />);
    await waitFor(() => expect(screen.getByText(walk.title)).toBeInTheDocument());

    fireEvent.click(screen.getByText(walk.title));

    expect(setLocation).toHaveBeenCalledWith(
      '/journeys/walk-1?source=nextStepsWalks',
    );
    expect(startJourney).not.toHaveBeenCalled();
  });

  it('starts a discovered devotional before navigating to its first entry', async () => {
    render(<Journeys />);
    await waitFor(() => expect(screen.getByText('Devotionals')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Devotionals' }));
    fireEvent.click(await screen.findByText(devotional.title));

    await waitFor(() => expect(startSeries).toHaveBeenCalledWith(
      'devotional-1',
      { userId: 'member-1' },
    ));
    expect(setLocation).toHaveBeenCalledWith(
      '/devotional/devotional-1/day/1?source=nextStepsDevotionals',
    );
  });

  it('routes a discovered sermon companion through its start-aware overview', async () => {
    render(<Journeys />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sermons' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Sermons' }));
    fireEvent.click(await screen.findByText(companion.title));

    expect(setLocation).toHaveBeenCalledWith(
      '/sermon-companion/companion-1/overview?source=nextStepsSermons',
    );
  });

  it('keeps the member Default sermon order from the API display order', async () => {
    render(<Journeys />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sermons' }));

    const first = await screen.findByText(laterCompanion.title);
    const second = await screen.findByText(earlierCompanion.title);
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});