/**
 * Onboarding.test.tsx
 *
 * Covers the four behaviours specified in Task 126:
 *  1. Step 0 (name input) renders when user.preferredName is empty.
 *  2. Step 0 is skipped — Step 1 renders directly — when user.preferredName is set.
 *  3. Submitting a name in Step 0 calls updateName and advances to Step 1.
 *  4. "Skip for now" advances to Step 1 without calling updateName.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Onboarding from '../Onboarding';

// ── Framer Motion: suppress animations in tests ───────────────────────────────
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    // Render children immediately without animation wrappers
    motion: new Proxy(actual.motion, {
      get(_target, prop: string) {
        const Tag = prop as keyof React.JSX.IntrinsicElements;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Comp = ({ children, ...rest }: any) => {
          // Strip framer-only props so React doesn't warn
          const {
            initial, animate, exit, transition, whileHover, whileTap, // eslint-disable-line @typescript-eslint/no-unused-vars
            ...domProps
          } = rest;
          return <Tag {...domProps}>{children}</Tag>;
        };
        return Comp;
      },
    }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/', mockSetLocation],
}));

// ── AuthContext ───────────────────────────────────────────────────────────────
const mockUpdateName = vi.fn();
let mockUser: { id: string; preferredName: string } | null = {
  id: 'subject-test',
  preferredName: '',
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    updateName: mockUpdateName,
  }),
}));

// ── JourneyContext ────────────────────────────────────────────────────────────
vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    journeys: [],
    startJourney: vi.fn(),
  }),
}));

// ── onboarding lib ────────────────────────────────────────────────────────────
vi.mock('@/lib/onboarding', () => ({
  markOnboarded: vi.fn(),
  isOnboarded: vi.fn(() => false),
}));

// ─────────────────────────────────────────────────────────────────────────────

describe('Onboarding — name-collection step (Step 0)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 0 (name input) when user.preferredName is empty', () => {
    mockUser = { id: 'subject-test', preferredName: '' };
    render(<Onboarding />);

    expect(
      screen.getByText(/what would you like us to call you/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/first name/i),
    ).toBeInTheDocument();
  });

  it('skips Step 0 and renders Step 1 directly when user.preferredName is already set', () => {
    mockUser = { id: 'subject-test', preferredName: 'Sarah' };
    render(<Onboarding />);

    // Step 1 heading should be visible
    expect(
      screen.getByText(/welcome, sarah/i),
    ).toBeInTheDocument();

    // Step 0 heading must NOT be present
    expect(
      screen.queryByText(/what would you like us to call you/i),
    ).not.toBeInTheDocument();
  });

  it('calls updateName with the entered name and advances to Step 1 on Continue', async () => {
    mockUser = { id: 'subject-test', preferredName: '' };
    const user = userEvent.setup();
    render(<Onboarding />);

    const input = screen.getByPlaceholderText(/first name/i);
    await user.type(input, 'James');

    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    expect(mockUpdateName).toHaveBeenCalledOnce();
    expect(mockUpdateName).toHaveBeenCalledWith('James');

    // After advancing, Step 1 should be shown (current copy)
    expect(
      screen.getByText(/let's begin by spending/i),
    ).toBeInTheDocument();
  });

  it('advances to Step 1 without calling updateName when "Skip for now" is clicked', async () => {
    mockUser = { id: 'subject-test', preferredName: '' };
    const user = userEvent.setup();
    render(<Onboarding />);

    const skipLink = screen.getByText(/skip for now/i);
    await user.click(skipLink);

    expect(mockUpdateName).not.toHaveBeenCalled();

    // Step 1 should now be visible (current copy)
    expect(
      screen.getByText(/let's begin by spending/i),
    ).toBeInTheDocument();
  });
});
