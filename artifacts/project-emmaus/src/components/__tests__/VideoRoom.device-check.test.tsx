import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrejoinCheck } from '../VideoRoom';

describe('meeting device check', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('checks microphone only for an audio meeting', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
      permissions: { query: vi.fn() },
    });

    render(<PrejoinCheck mode="audio" onJoin={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.queryByText(/Camera on/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /check selected devices/i }));

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    });
    expect(navigator.permissions.query).not.toHaveBeenCalled();
  });

  it('joins listen-only without using any media or permission API', () => {
    const getUserMedia = vi.fn();
    const enumerateDevices = vi.fn();
    const query = vi.fn();
    const onJoin = vi.fn();
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia, enumerateDevices },
      permissions: { query },
    });

    render(<PrejoinCheck mode="audio" onJoin={onJoin} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /listen only/i }));
    fireEvent.click(screen.getByRole('button', { name: /use these settings/i }));

    expect(onJoin).toHaveBeenCalledWith({
      listenOnly: true,
      microphone: false,
      camera: false,
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(enumerateDevices).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('does not request camera access when video members turn camera off', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    });
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
      permissions: { query: vi.fn() },
    });

    render(<PrejoinCheck mode="video" onJoin={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /camera on/i }));
    fireEvent.click(screen.getByRole('button', { name: /check selected devices/i }));

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    });
  });

  it('uses mobile-safe stacked controls and actions', () => {
    const { container } = render(
      <PrejoinCheck mode="audio" onJoin={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(container.firstElementChild).toHaveClass(
      'w-full',
      'max-w-full',
      'min-w-0',
      'overflow-x-hidden',
      'box-border',
    );
    expect(container.querySelectorAll('.flex-col.sm\\:flex-row')).toHaveLength(2);
  });
});