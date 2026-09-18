/**
 * SermonCompanionReader.completion.test.tsx
 *
 * Confirms the next-entry CTA visibility on the SermonCompanionReader completion card.
 *
 * The "Continue to Next Reflection" CTA is only rendered on the `justCompleted`
 * path (immediately after the member taps "Finished").  These tests simulate
 * that flow and verify:
 *
 *  1. Next entry Published  → "Continue to Next Reflection" CTA is shown.
 *  2. Next entry Draft      → CTA is hidden; only the return button is shown.
 *  3. Next entry missing    → CTA is hidden; only the return button is shown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── wouter ────────────────────────────────────────────────────────────────────
const mockSetLocation = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ id: 'companion-1', day: '1' }),
  useLocation: () => ['/', mockSetLocation],
}));

// ── AuthContext ───────────────────────────────────────────────────────────────
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', preferredName: 'Tester' },
  }),
}));

// ── BottomNav ─────────────────────────────────────────────────────────────────
vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav" />,
}));

// ── SermonCompanionReading — render only the actionButton ────────────────────
vi.mock('@/components/SermonCompanionReading', () => ({
  SermonCompanionReading: ({ actionButton }: { actionButton: React.ReactNode }) => (
    <div data-testid="reading-area">{actionButton}</div>
  ),
}));

// ─────────────────────────────────────────────────────────────────────────────

import SermonCompanionReader from '../SermonCompanionReader';

// ── Shared fixture helpers ────────────────────────────────────────────────────

function makeEntry(dayNumber: number, status: string) {
  return {
    id: `entry-${dayNumber}`,
    dayNumber,
    title: `Day ${dayNumber}`,
    scriptureReference: 'John 1:1',
    greeting: 'Hello',
    reflection: 'Reflect.',
    prayer: 'Pray.',
    nextStep: 'Act.',
    closing: 'Amen.',
    status,
  };
}

/** Stubs three fetch routes for a test run. */
function setupFetch(day2Status: string | null) {
  const entries = [makeEntry(1, 'Published')];
  if (day2Status !== null) entries.push(makeEntry(2, day2Status));

  const companion = {
    id: 'companion-1',
    title: 'Test Companion',
    numberOfDays: entries.length,
    entries,
    progress: null, // no prior progress → triggers startCompanion
  };

  const startedProgress = { currentDay: 1, completedDays: [] };
  const completedProgress = { currentDay: 1, completedDays: [1] };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      const method = options?.method?.toUpperCase() ?? 'GET';

      // loadMemberCompanion
      if (method === 'GET' && url.includes('/member')) {
        return { ok: true, json: async () => companion } as Response;
      }
      // startCompanion
      if (method === 'POST' && url.includes('/progress/start')) {
        return { ok: true, json: async () => startedProgress } as Response;
      }
      // completeDayApi
      if (method === 'POST' && url.includes('/progress/complete-day')) {
        return { ok: true, json: async () => completedProgress } as Response;
      }

      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

describe('SermonCompanionReader — completion card next-entry CTA visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows "Continue to Next Reflection" when the next entry is Published', async () => {
    setupFetch('Published');
    const user = userEvent.setup();

    render(<SermonCompanionReader />);

    // Wait for the page to load and display the Finished button
    const finishedBtn = await screen.findByRole('button', { name: /finished/i });
    await user.click(finishedBtn);

    // After completion the EmmausCompletionCard with Continue should appear
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /continue to next reflection/i }),
      ).toBeInTheDocument();
    });

    // Return link is rendered as a secondary text link below Continue
    // (no ?source= in tests → resolveReturn falls back to 'Back to Discover')
    expect(screen.getByText(/back to discover/i)).toBeInTheDocument();
  });

  it('hides the CTA and shows only the return button when the next entry is Draft', async () => {
    setupFetch('Draft');
    const user = userEvent.setup();

    render(<SermonCompanionReader />);

    const finishedBtn = await screen.findByRole('button', { name: /finished/i });
    await user.click(finishedBtn);

    await waitFor(() => {
      // "Continue" must NOT appear
      expect(
        screen.queryByRole('button', { name: /continue/i }),
      ).not.toBeInTheDocument();
    });

    // Only the primary return button
    expect(screen.getByRole('button', { name: /^back to discover$/i })).toBeInTheDocument();
  });

  it('hides the CTA and shows only the return button when there is no next entry', async () => {
    setupFetch(null); // only day 1 exists
    const user = userEvent.setup();

    render(<SermonCompanionReader />);

    const finishedBtn = await screen.findByRole('button', { name: /finished/i });
    await user.click(finishedBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /continue/i }),
      ).not.toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /^back to discover$/i })).toBeInTheDocument();
  });
});
