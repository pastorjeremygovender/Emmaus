import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PersonalDetails from '../PersonalDetails';
import Personal from '../Personal';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  updateMemberProfile: vi.fn(),
  getMemberProfile: vi.fn(),
}));
const setLocation = mocks.setLocation;
const updateMemberProfile = mocks.updateMemberProfile;
const getMemberProfile = mocks.getMemberProfile;

const profile = {
  preferredName: 'Grace',
  email: 'grace@example.com',
  contactNumber: null,
  physicalAddress: null,
  dateOfBirth: null,
  iccMembership: null,
};

vi.mock('wouter', () => ({
  Link: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
  useLocation: () => ['/profile/personal-details', setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'member-ui-test',
      email: 'grace@example.com',
      role: 'user',
      preferredName: 'Grace',
    },
    loading: false,
  }),
}));

vi.mock('@/lib/member-profile-api', () => ({
  getMemberProfile: mocks.getMemberProfile,
  updateMemberProfile: mocks.updateMemberProfile,
}));

vi.mock('@/components/MemberHeaderActions', () => ({
  MemberHeaderActions: () => null,
}));

vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => null,
}));

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({ progress: {}, reflections: {}, journeys: [] }),
}));

vi.mock('@/lib/favourites-api', () => ({
  fetchFavourites: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/history-api', () => ({
  fetchHistory: vi.fn().mockResolvedValue([]),
  historyTimeLabel: vi.fn().mockReturnValue('Recently'),
}));

vi.mock('@/components/UnifiedEmmausInput', () => ({
  UnifiedEmmausInput: () => null,
}));

vi.mock('@/components/SectionWrapper', () => ({
  SectionWrapper: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/FavouriteButton', () => ({
  FavouriteButton: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

describe('Personal Details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getMemberProfile.mockResolvedValue(profile);
    updateMemberProfile.mockResolvedValue({
      ...profile,
      contactNumber: '+27 82 555 0101',
      physicalAddress: '12 Emmaus Lane',
      dateOfBirth: '1985-02-03',
      iccMembership: 'yes',
    });
  });

  it('loads the read-only email and saves the editable member fields', async () => {
    render(<PersonalDetails />);

    expect(await screen.findByDisplayValue('grace@example.com')).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText(/Mobile or contact number/), {
      target: { value: '+27 82 555 0101' },
    });
    fireEvent.change(screen.getByLabelText(/Physical address/), {
      target: { value: '12 Emmaus Lane' },
    });
    fireEvent.change(screen.getByLabelText(/Date of birth/), {
      target: { value: '1985-02-03' },
    });
    fireEvent.click(screen.getByLabelText('Yes'));
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));

    await waitFor(() => expect(updateMemberProfile).toHaveBeenCalledWith({
      preferredName: 'Grace',
      contactNumber: '+27 82 555 0101',
      physicalAddress: '12 Emmaus Lane',
      dateOfBirth: '1985-02-03',
      iccMembership: 'yes',
    }));
    expect(await screen.findByText('Saved just now')).toBeInTheDocument();
  });

  it('shows inline validation and keeps the form available after an invalid submission', async () => {
    render(<PersonalDetails />);

    const preferredName = await screen.findByLabelText('Preferred name');
    fireEvent.change(preferredName, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(await screen.findByText('Please tell us what you would like to be called.')).toBeInTheDocument();
    expect(updateMemberProfile).not.toHaveBeenCalled();
  });
});

describe('Personal details reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getMemberProfile.mockResolvedValue(profile);
  });

  it('is dismissible without blocking the Profile page and still navigates to details', async () => {
    render(<Personal />);

    expect(await screen.findByText('A few details are still missing. Add them whenever you have a quiet moment.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('button-personal-details'));
    expect(setLocation).toHaveBeenCalledWith('/profile/personal-details');

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss personal details reminder' }));
    await waitFor(() => {
      expect(screen.queryByText('A few details are still missing. Add them whenever you have a quiet moment.')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('button-personal-details')).toBeInTheDocument();
  });
});