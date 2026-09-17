import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExploreJourneys from '../journeys/ExploreJourneys';

const setLocation = vi.fn();
const startJourney = vi.fn(() => Promise.resolve());

const journey = {
  id: 'journey-1',
  title: 'A Walk of Trust',
  description: 'A guided walk.',
  subtitle: '',
  status: 'Published',
  journeyType: 'walk',
  churchWide: true,
  durationDays: 5,
  estimatedDuration: '10 minutes',
  collectionId: null,
  overloadExempt: false,
};

vi.mock('wouter', () => ({
  useLocation: () => ['/journeys/explore', setLocation],
}));

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    journeys: [journey],
    progress: {},
    startJourney,
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'member-1', role: 'member' } }),
}));

vi.mock('@/contexts/RoomsContext', () => ({
  useRooms: () => ({ getMyRooms: () => [], loadRooms: vi.fn(() => Promise.resolve()) }),
}));

vi.mock('@/lib/enrollment', () => ({
  useEnrollment: () => ({
    getState: () => 'active',
    saveForLater: vi.fn(),
    canActivateMore: () => true,
  }),
  isExemptJourney: () => false,
}));

vi.mock('@/lib/collections-api', () => ({
  listCollections: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/lib/journeys-api', () => ({
  checkJourneysHaveIntro: vi.fn(() => Promise.resolve(new Set())),
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

describe('Discovery → My Emmaus contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts the walk before navigating to its first step', async () => {
    render(<ExploreJourneys />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'On my own' }));

    await waitFor(() => expect(startJourney).toHaveBeenCalledWith('journey-1', 'walk'));
    expect(setLocation).toHaveBeenCalledWith(
      '/journey/journey-1/day/1?source=nextStepsWalks',
    );
    expect(startJourney.mock.invocationCallOrder[0]).toBeLessThan(
      setLocation.mock.invocationCallOrder[0],
    );
  });

  it('classifies a discovered non-walk journey for the Journeys surface', async () => {
    journey.journeyType = 'course';
    render(<ExploreJourneys />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'On my own' }));

    await waitFor(() => expect(startJourney).toHaveBeenCalledWith('journey-1', 'journey'));
    expect(setLocation).toHaveBeenCalledWith(
      '/journey/journey-1/day/1?source=nextStepsJourneys',
    );
  });
});