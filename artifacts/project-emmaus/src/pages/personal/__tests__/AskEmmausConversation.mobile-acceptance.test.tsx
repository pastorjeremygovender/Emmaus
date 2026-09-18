import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  startConversation: vi.fn(),
  streamCallbacks: null as any,
  takePendingMessage: vi.fn(() => ({
    message: 'Open the walk please',
    context: { entryPoint: 'walk' as const, journeyId: 'walk-b', currentDay: 2 },
  })),
}));

vi.mock('wouter', () => ({
  useParams: () => ({}),
  useLocation: () => ['/personal/ask-emmaus/conversation', mocks.setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'member-a', preferredName: 'Member A' },
    updateName: vi.fn(),
  }),
}));

vi.mock('@/lib/emmaus-pending', () => ({
  takePendingMessage: mocks.takePendingMessage,
  getReturnDestination: vi.fn(() => null),
  clearReturnDestination: vi.fn(),
}));

vi.mock('@/lib/emmaus-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/emmaus-client')>('@/lib/emmaus-client');
  return {
    ...actual,
    startConversation: mocks.startConversation,
    appendMessage: vi.fn(),
    getMessages: vi.fn(),
    saveMemory: vi.fn(),
  };
});

vi.mock('@/components/BottomNav', () => ({
  BottomNav: () => <nav aria-label="Bottom navigation" />,
}));
vi.mock('@/components/emmaus/EmmausComposer', () => ({
  EmmausComposer: () => <textarea aria-label="Follow-up message" />,
}));
vi.mock('@/components/emmaus/HearEmmausButton', () => ({
  HearEmmausButton: () => null,
}));
vi.mock('@/components/ShareButton', () => ({
  ShareButton: () => null,
}));
vi.mock('@/components/emmaus/ScriptureCard', () => ({
  ScriptureCard: () => null,
}));
vi.mock('@/components/emmaus/NextStepCard', () => ({
  NextStepCard: () => null,
}));
vi.mock('@/components/emmaus/NextStepsCard', () => ({
  NextStepsCard: () => null,
}));
vi.mock('@/components/emmaus/ResourceCard', () => ({
  ResourceCard: () => null,
}));
vi.mock('@/components/emmaus/SermonRecommendationCard', () => ({
  SermonRecommendationCard: () => null,
}));
vi.mock('@/components/emmaus/InlineScriptureProse', () => ({
  InlineScriptureProse: ({ text }: { text: string }) => <p>{text}</p>,
}));
vi.mock('@/components/emmaus/SafetyHandoverCard', () => ({
  SafetyHandoverCard: () => null,
}));
vi.mock('@/components/emmaus/MemoryConsentBar', () => ({
  MemoryConsentBar: () => null,
}));

import AskEmmausConversation from '../AskEmmausConversation';

describe('Ask Emmaus authenticated mobile acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streamCallbacks = null;
    mocks.startConversation.mockImplementation(({ callbacks }) => {
      mocks.streamCallbacks = callbacks;
      callbacks.onDone({
        type: 'done',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        promptVersion: 'test',
        metadata: {
          answer: 'Opening Walk B.',
          displayAnswer: 'Opening Walk B.',
          requestedIntent: 'OPEN',
          scripture: null,
          nextStep: null,
          nextSteps: [],
          recommendations: [],
          followUpPrompts: [],
          handoffType: null,
          jarvis: {
            contractVersion: 'jarvis.v1',
            intent: 'CONTINUE',
            pastoralText: 'Opening Walk B.',
            scriptureReferences: [],
            contentReferences: [],
            suggestedNextAction: {
              kind: 'OPEN',
              targetType: 'resource',
              targetId: 'walk-b',
              label: 'Open Walk B',
              route: '/journey/walk-b/day/2',
              resourceType: 'walk',
            },
            actions: [],
            handoffType: null,
            retrievalFailures: [],
          },
        },
      });
    });
  });

  it('executes the returned route and keeps the mobile shell clear of bottom-nav padding overlap', async () => {
    window.innerWidth = 360;
    const { container } = render(<AskEmmausConversation />);

    await waitFor(() => {
      expect(mocks.setLocation).toHaveBeenCalledWith('/journey/walk-b/day/2');
    });
    expect(screen.getByLabelText('Follow-up message')).toBeInTheDocument();

    const root = container.firstElementChild as HTMLElement;
    const main = container.querySelector('main') as HTMLElement;
    expect(root.className).not.toContain('pb-16');
    expect(main.className).toContain('pb-28');
    expect(container.querySelector('[aria-label="Bottom navigation"]')).toBeInTheDocument();
  });

  it('does not scroll for every streamed chunk and disengages immediately after upward scrolling', async () => {
    vi.useFakeTimers();
    mocks.startConversation.mockImplementation(({ callbacks }) => {
      mocks.streamCallbacks = callbacks;
    });

    try {
      const { container } = render(<AskEmmausConversation />);
      const main = container.querySelector('main') as HTMLElement;
      const scrollTo = vi.fn(({ top }: { top: number }) => {
        main.scrollTop = top;
      });
      Object.defineProperties(main, {
        clientHeight: { configurable: true, value: 600 },
        scrollHeight: { configurable: true, writable: true, value: 1000 },
        scrollTop: { configurable: true, writable: true, value: 0 },
      });
      Object.defineProperty(main, 'scrollTo', {
        configurable: true,
        value: scrollTo,
      });

      await act(async () => {
        await Promise.resolve();
      });
      expect(mocks.streamCallbacks).not.toBeNull();
      await act(async () => {
        vi.advanceTimersByTime(20);
      });
      const initialScrolls = scrollTo.mock.calls.length;
      expect(initialScrolls).toBe(1);

      await act(async () => {
        mocks.streamCallbacks.onText('first chunk');
        mocks.streamCallbacks.onText('second chunk');
        mocks.streamCallbacks.onText('third chunk');
        vi.advanceTimersByTime(30);
      });
      expect(scrollTo.mock.calls.length - initialScrolls).toBeLessThan(3);

      main.scrollTop = 80;
      fireEvent.scroll(main);
      const scrollsAfterUpwardGesture = scrollTo.mock.calls.length;

      await act(async () => {
        mocks.streamCallbacks.onText('content after the member scrolled up');
        vi.advanceTimersByTime(500);
      });
      expect(scrollTo).toHaveBeenCalledTimes(scrollsAfterUpwardGesture);

      await act(async () => {
        mocks.streamCallbacks.onDone({
          type: 'done',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          promptVersion: 'test',
          metadata: {
            answer: 'A completed answer.',
            displayAnswer: 'A completed answer.',
            nextStep: null,
            retrievalFailures: [],
            handoffType: null,
            resourceActions: [],
            capabilityActions: [],
            recommendations: [],
            followUpPrompts: [],
            jarvis: null,
          },
        });
        vi.advanceTimersByTime(50);
      });
      expect(main.scrollTop).toBe(80);
    } finally {
      vi.useRealTimers();
    }
  });
});