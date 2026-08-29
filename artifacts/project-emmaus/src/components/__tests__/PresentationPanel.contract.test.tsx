import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentationPanel } from '../PresentationPanel';

const changePage = vi.fn().mockResolvedValue(undefined);
const stopPresentation = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/rooms-api-media', () => ({
  getMediaUrl: () => '/media/slides.pdf',
  apiChangePresentationPage: (...args: unknown[]) => changePage(...args),
  apiStopPresentation: (...args: unknown[]) => stopPresentation(...args),
}));

describe('PresentationPanel active identifiers', () => {
  beforeEach(() => {
    changePage.mockClear();
    stopPresentation.mockClear();
  });
  it('sends active session and presentation IDs from the rendered presentation', async () => {
    render(<PresentationPanel
      presentation={{
        id: 'presentation-9',
        sessionId: 'session-7',
        messageId: 'message-4',
        filename: 'slides.pdf',
        mediaType: 'pdf',
        objectPath: '/objects/slides',
        presentedBy: 'leader',
        presentedByName: 'Leader',
        currentPage: 1,
        pageCount: 4,
      }}
      isLeader
      userId="user"
      roomId="room"
    />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    await waitFor(() => expect(changePage).toHaveBeenCalledWith(
      'user', 'room', 'session-7', 'presentation-9', 2,
    ));
  });

  it('does not send a stale presentation mutation without authoritative IDs', () => {
    render(<PresentationPanel
      presentation={{
        messageId: 'legacy',
        filename: 'slides.pdf',
        mediaType: 'pdf',
        objectPath: '/objects/slides',
        presentedBy: 'leader',
        presentedByName: 'Leader',
        currentPage: 1,
        pageCount: 4,
      }}
      isLeader
      userId="user"
      roomId="room"
    />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(changePage).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/stale|ended/i);
  });
});