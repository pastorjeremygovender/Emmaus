import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accountStorageKey } from '@/lib/account-storage';
import { BibleProvider, useBible, type VerseNote } from '@/contexts/BibleContext';
import { JourneyProvider, useJourney } from '@/contexts/JourneyContext';

const mocks = vi.hoisted(() => ({
  currentUser: {
    id: 'subject-a',
    role: 'user',
    email: 'a@example.test',
    preferredName: 'A',
  } as {
    id: string;
    role: 'user';
    email: string;
    preferredName: string;
  } | null,
  loadBibleDataWithStatus: vi.fn(),
  patchBibleData: vi.fn(),
  listPublishedJourneys: vi.fn(),
  listJourneys: vi.fn(),
  listSteps: vi.fn(),
  getAllProgress: vi.fn(),
  getDailyRhythmState: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mocks.currentUser }),
}));

vi.mock('@/lib/bible-api', () => ({
  loadBibleDataWithStatus: mocks.loadBibleDataWithStatus,
  patchBibleData: mocks.patchBibleData,
}));

vi.mock('@/lib/journeys-api', () => ({
  listPublishedJourneys: mocks.listPublishedJourneys,
  listJourneys: mocks.listJourneys,
  listSteps: mocks.listSteps,
  getAllProgress: mocks.getAllProgress,
  getDailyRhythmState: mocks.getDailyRhythmState,
}));

const emptyBibleData = {
  translationId: undefined,
  history: [],
  completed: [],
  journeyProgress: {},
  highlights: [],
  favourites: [],
  bookmarks: [],
  notes: [],
  reflections: [],
  prayers: [],
};

function BibleProbe() {
  const bible = useBible();
  return (
    <>
      <output data-testid="bible-translation">{bible.translationId}</output>
      <output data-testid="bible-notes">
        {bible.notes.map(note => note.text).join(',')}
      </output>
      <output data-testid="bible-history">{bible.readingHistory.length}</output>
    </>
  );
}

function JourneyProbe() {
  const journey = useJourney();
  return (
    <>
      <output data-testid="journey-progress">
        {journey.progress.daily?.currentDay ?? 'none'}
      </output>
      <output data-testid="journey-reflections">
        {Object.values(journey.reflections).join(',')}
      </output>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.getDailyRhythmState.mockResolvedValue(null);
  mocks.loadBibleDataWithStatus.mockResolvedValue({ data: emptyBibleData, status: 'found' });
  mocks.currentUser = {
    id: 'subject-a',
    role: 'user',
    email: 'a@example.test',
    preferredName: 'A',
  };
});

describe('provider state ownership during account switches', () => {
  it('blanks account A Bible state immediately and never imports generic state into B', async () => {
    const accountANote: VerseNote = {
      id: 'note-a',
      bookId: 'john',
      chapter: 1,
      verse: 1,
      verseText: 'In the beginning',
      text: 'Account A note',
      createdAt: '2026-08-19T00:00:00.000Z',
      updatedAt: '2026-08-19T00:00:00.000Z',
    };
    localStorage.setItem('emmaus_bible_notes', JSON.stringify([
      { ...accountANote, id: 'legacy', text: 'Unowned legacy note' },
    ]));
    mocks.loadBibleDataWithStatus.mockImplementation((subject: string) => {
      if (subject === 'subject-a') {
        return Promise.resolve({
          data: { ...emptyBibleData, notes: [accountANote] },
          status: 'found',
        });
      }
      return new Promise(() => {});
    });

    const view = render(
      <BibleProvider>
        <BibleProbe />
      </BibleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bible-notes')).toHaveTextContent('Account A note');
    });

    mocks.currentUser = {
      id: 'subject-b',
      role: 'user',
      email: 'b@example.test',
      preferredName: 'B',
    };
    view.rerender(
      <BibleProvider>
        <BibleProbe />
      </BibleProvider>,
    );

    expect(screen.getByTestId('bible-notes')).toHaveTextContent('');
    expect(screen.getByTestId('bible-history')).toHaveTextContent('0');
    expect(mocks.patchBibleData).not.toHaveBeenCalledWith(
      'subject-b',
      expect.objectContaining({ notes: expect.any(Array) }),
    );
  });

  it('uses NIV for a new account and records the default only after a confirmed missing cloud record', async () => {
    mocks.currentUser = {
      id: 'subject-new',
      role: 'user',
      email: 'new@example.test',
      preferredName: 'New',
    };
    mocks.loadBibleDataWithStatus.mockResolvedValue({ data: null, status: 'missing' });

    render(
      <BibleProvider>
        <BibleProbe />
      </BibleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bible-translation')).toHaveTextContent('niv');
    });
    expect(mocks.patchBibleData).toHaveBeenCalledWith(
      'subject-new',
      expect.objectContaining({ translationId: 'niv' }),
    );
  });

  it('lets a confirmed cloud preference win over a stale account-scoped local cache', async () => {
    mocks.currentUser = {
      id: 'subject-cloud',
      role: 'user',
      email: 'cloud@example.test',
      preferredName: 'Cloud',
    };
    localStorage.setItem(
      accountStorageKey('emmaus_bible_translation', 'subject-cloud'),
      JSON.stringify('bsb'),
    );
    mocks.loadBibleDataWithStatus.mockResolvedValue({
      data: { ...emptyBibleData, translationId: 'niv' },
      status: 'found',
    });

    render(
      <BibleProvider>
        <BibleProbe />
      </BibleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bible-translation')).toHaveTextContent('niv');
    });
    expect(mocks.patchBibleData).not.toHaveBeenCalledWith(
      'subject-cloud',
      expect.objectContaining({ translationId: 'bsb' }),
    );
  });

  it('treats a legacy account-scoped BSB value as explicit when the cloud record has no preference', async () => {
    mocks.currentUser = {
      id: 'subject-legacy',
      role: 'user',
      email: 'legacy@example.test',
      preferredName: 'Legacy',
    };
    localStorage.setItem(
      accountStorageKey('emmaus_bible_translation', 'subject-legacy'),
      JSON.stringify('bsb'),
    );
    mocks.loadBibleDataWithStatus.mockResolvedValue({
      data: emptyBibleData,
      status: 'found',
    });

    render(
      <BibleProvider>
        <BibleProbe />
      </BibleProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('bible-translation')).toHaveTextContent('bsb');
    });
    expect(mocks.patchBibleData).toHaveBeenCalledWith(
      'subject-legacy',
      expect.objectContaining({ translationId: 'bsb' }),
    );
  });

  it('blanks account A journey progress and reflections before B finishes loading', async () => {
    localStorage.setItem(
      accountStorageKey('emmaus_reflections', 'subject-a'),
      JSON.stringify({ 'daily-1': 'Account A reflection' }),
    );
    localStorage.setItem(
      'emmaus_reflections',
      JSON.stringify({ 'daily-1': 'Unowned legacy reflection' }),
    );
    mocks.listPublishedJourneys.mockResolvedValue([
      {
        id: 'daily',
        title: 'Daily',
        description: '',
        journeyType: 'daily-rhythm',
        durationDays: 2,
        status: 'Published',
      },
    ]);
    mocks.listSteps.mockResolvedValue([]);
    mocks.getAllProgress.mockImplementation(() => {
      if (mocks.currentUser?.id === 'subject-a') {
        return Promise.resolve({
          daily: {
            journeyId: 'daily',
            currentDay: 2,
            completedDays: [1],
            startedAt: '2026-08-19T00:00:00.000Z',
            lastCompletedAt: '2026-08-19T00:00:00.000Z',
          },
        });
      }
      return new Promise(() => {});
    });

    const view = render(
      <JourneyProvider>
        <JourneyProbe />
      </JourneyProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('journey-progress')).toHaveTextContent('2');
      expect(screen.getByTestId('journey-reflections')).toHaveTextContent(
        'Account A reflection',
      );
    });

    await act(async () => {
      mocks.currentUser = {
        id: 'subject-b',
        role: 'user',
        email: 'b@example.test',
        preferredName: 'B',
      };
      view.rerender(
        <JourneyProvider>
          <JourneyProbe />
        </JourneyProvider>,
      );
    });

    expect(screen.getByTestId('journey-progress')).toHaveTextContent('none');
    expect(screen.getByTestId('journey-reflections')).toHaveTextContent('');
  });
});