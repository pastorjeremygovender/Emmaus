import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PastoralHome from '../PastoralHome';

const mockApi = vi.hoisted(() => ({
  getDashTodayStats: vi.fn(),
  getPastoralBriefing: vi.fn(),
  listPeople: vi.fn(),
}));

vi.mock('@/lib/pastoral-api', () => mockApi);
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', role: 'admin' },
  }),
}));

const emptyStats = {
  attendance: { present: 0, expected: 0, sessionCount: 0 },
  activeWalks: 0,
  activeDevotionals: 0,
  devotionalActivityToday: 0,
  newPeopleThisWeek: { pastoralPersons: 0, emmausAccounts: 0 },
  followUpSignalCount: 0,
};

const emptyBriefing = {
  rules: {},
  matches: [],
  evaluatedAt: '2026-09-02T00:00:00.000Z',
};

function renderHome() {
  return render(
    <PastoralHome
      onOpenPeople={vi.fn()}
      onOpenAttendance={vi.fn()}
      onOpenPerson={vi.fn()}
    />,
  );
}

describe('PastoralHome data boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.getDashTodayStats.mockResolvedValue(emptyStats);
    mockApi.getPastoralBriefing.mockResolvedValue(emptyBriefing);
    mockApi.listPeople.mockResolvedValue([]);
  });

  it('keeps successful register and Walk data visible when briefing fails', async () => {
    mockApi.getDashTodayStats.mockResolvedValue({ ...emptyStats, activeWalks: 4 });
    mockApi.getPastoralBriefing.mockRejectedValue(new Error('briefing unavailable'));
    mockApi.listPeople.mockResolvedValue([
      {
        id: 'member-1',
        sourceId: 'member-1',
        personType: 'emmaus_user',
        subType: 'emmaus_user',
        fullName: 'Member One',
        email: 'member@example.com',
        phone: null,
        linkedUserId: 'member-1',
        isLinked: true,
        lastAttendanceDate: null,
        lastAttendanceStatus: null,
        churchId: 'icc',
      },
      {
        id: 'visitor-1',
        sourceId: 'visitor-1',
        personType: 'pastoral_person',
        subType: 'visitor',
        fullName: 'Visitor One',
        email: 'visitor@example.com',
        phone: null,
        linkedUserId: null,
        isLinked: false,
        lastAttendanceDate: null,
        lastAttendanceStatus: null,
        churchId: 'icc',
      },
    ]);

    renderHome();
    await waitFor(() => expect(screen.getByText('2 people')).toBeInTheDocument());

    expect(screen.getByText('4 active Walks')).toBeInTheDocument();
    expect(screen.getAllByText('The pastoral briefing could not be loaded.')).toHaveLength(2);
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('None')).not.toBeInTheDocument();
  });

  it('keeps valid empty results distinct from failed results', async () => {
    renderHome();
    await act(async () => { await Promise.resolve(); });

    await waitFor(() => expect(screen.getByText('0 people')).toBeInTheDocument());
    expect(screen.getByText('Nothing needs your attention right now.')).toBeInTheDocument();
    expect(screen.getByText('Not recorded')).toBeInTheDocument();
  });
});