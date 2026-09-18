import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('reports the Android keyboard only while focused in a reduced visual viewport', () => {
    const onKeyboardStateChange = vi.fn();
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const originalVisualViewport = window.visualViewport;
    const viewportListeners: Record<string, EventListener> = {};
    const visualViewport = {
      height: 800,
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        viewportListeners[type] = listener;
      }),
      removeEventListener: vi.fn(),
    } as unknown as VisualViewport;

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    });

    try {
      render(
        <UnifiedEmmausInput
          conversationOnly
          onKeyboardStateChange={onKeyboardStateChange}
        />,
      );
      const input = screen.getByRole('textbox', { name: 'Ask Emmaus or search' });

      act(() => input.focus());
      expect(onKeyboardStateChange).toHaveBeenLastCalledWith(false);

      act(() => {
        Object.defineProperty(visualViewport, 'height', {
          configurable: true,
          value: 420,
        });
        viewportListeners.resize?.(new Event('resize'));
      });
      expect(onKeyboardStateChange).toHaveBeenLastCalledWith(true);

      act(() => input.blur());
      expect(onKeyboardStateChange).toHaveBeenLastCalledWith(false);
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      });
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: originalVisualViewport,
      });
    }
  });
});