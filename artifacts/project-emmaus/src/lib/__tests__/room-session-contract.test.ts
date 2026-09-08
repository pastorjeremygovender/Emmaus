import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiBroadcastEvent,
  apiChangeMode,
  apiCloseSharedTool,
  apiCreatePoll,
  apiNavigate,
  apiOpenGroupDiscussion,
} from '../rooms-api';
import {
  apiChangePresentationPage,
  apiStartPresentation,
  apiStopPresentation,
} from '../rooms-api-media';

const ok = () => new Response(JSON.stringify({ ok: true, discussion: { id: 'discussion-1' }, presentation: {} }), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

describe('active meeting request contracts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('serializes sessionId for navigation, mode, close, broadcast and discussion lifecycle', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    await apiNavigate('user', 'room', 'session-7', { stepId: 'step-2' });
    await apiChangeMode('user', 'room', 'session-7', 'discussion', 'Leader');
    await apiCloseSharedTool('user', 'room', 'session-7', 'discussion');
    await apiBroadcastEvent('user', 'room', 'session-7', 'focus_verse', { id: 'verse' });
    await apiOpenGroupDiscussion('user', 'room', 'session-7');
    await apiCreatePoll('user', 'room', { sessionId: 'session-7', question: 'Ready?' });

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies).toEqual([
      { sessionId: 'session-7', stepId: 'step-2' },
      { sessionId: 'session-7', mode: 'discussion', leaderName: 'Leader' },
      { sessionId: 'session-7', tool: 'discussion' },
      { sessionId: 'session-7', type: 'focus_verse', payload: { id: 'verse' } },
      { sessionId: 'session-7' },
      { sessionId: 'session-7', question: 'Ready?' },
    ]);
  });

  it('serializes the exact session and presentation identifiers for presentation mutations', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    await apiStartPresentation('user', 'room', {
      sessionId: 'session-7',
      messageId: 'message-4',
      filename: 'slides.pdf',
      mediaType: 'pdf',
      objectPath: '/objects/slides',
    });
    await apiChangePresentationPage('user', 'room', 'session-7', 'presentation-9', 3);
    await apiStopPresentation('user', 'room', 'session-7', 'presentation-9');

    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies[0]).toMatchObject({ sessionId: 'session-7', messageId: 'message-4' });
    expect(bodies[1]).toEqual({ sessionId: 'session-7', presentationId: 'presentation-9', page: 3 });
    expect(bodies[2]).toEqual({ sessionId: 'session-7', presentationId: 'presentation-9' });
  });
});