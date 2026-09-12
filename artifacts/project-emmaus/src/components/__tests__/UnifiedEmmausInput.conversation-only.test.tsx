import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setPendingMessage: vi.fn(),
  setReturnDestination: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/walk', mocks.navigate],
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'member-1' } }),
}));
vi.mock('@/hooks/useVoiceEnabled', () => ({
  useVoiceEnabled: () => false,
}));
vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    journeys: [],
    progress: {},
    getStep: vi.fn(),
  }),
}));
vi.mock('@/contexts/BibleContext', () => ({
  useBible: () => ({ lastRead: null }),
}));
vi.mock('@/lib/emmaus-pending', () => ({
  setPendingMessage: mocks.setPendingMessage,
  setReturnDestination: mocks.setReturnDestination,
  setPendingContext: vi.fn(),
  sourceSectionFromPath: () => 'walk',
}));
vi.mock('@/lib/emmaus-screen-context', () => ({
  buildEmmausScreenContext: () => ({
    entryPoint: 'walk',
    journeyId: 'journey-1',
    currentDay: 3,
  }),
}));
vi.mock('@/lib/search-api', () => ({
  globalSearch: vi.fn(),
  CONTENT_TYPE_LABEL: {},
}));
vi.mock('@/lib/voice-audio-unlock', () => ({
  unlockVoiceAudio: vi.fn(),
}));

import { UnifiedEmmausInput } from '../UnifiedEmmausInput';

describe('UnifiedEmmausInput conversation-only', () => {
  it('submits directly with the current screen context rather than opening a launcher', () => {
    render(<UnifiedEmmausInput conversationOnly />);
    const input = screen.getByRole('textbox', { name: 'Ask Emmaus or search' });

    fireEvent.change(input, { target: { value: 'What should I continue today?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Emmaus' }));

    expect(mocks.setPendingMessage).toHaveBeenCalledWith(
      'What should I continue today?',
      { entryPoint: 'walk', journeyId: 'journey-1', currentDay: 3 },
    );
    expect(mocks.navigate).toHaveBeenCalledWith('/personal/ask-emmaus/conversation');
    expect(screen.queryByRole('button', { name: 'Ask Emmaus anything' })).not.toBeInTheDocument();
  });
});