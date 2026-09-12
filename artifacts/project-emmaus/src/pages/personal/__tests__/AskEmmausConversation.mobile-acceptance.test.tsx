import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  setLocation: vi.fn(),
  startConversation: vi.fn(),
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
    mocks.startConversation.mockImplementation(({ callbacks }) => {
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
});