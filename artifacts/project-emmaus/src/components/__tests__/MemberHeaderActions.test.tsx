import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberHeaderActions } from '@/components/MemberHeaderActions';

vi.mock('wouter', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useLocation: () => ['/walk', vi.fn()],
}));

vi.mock('@/contexts/AppearanceContext', () => ({
  useAppearance: () => ({
    theme: 'light',
    fontSize: 'standard',
    setTheme: vi.fn(),
    setFontSize: vi.fn(),
  }),
}));

vi.mock('@/components/ShareEmmausButton', () => ({
  ShareEmmausButton: () => <button type="button" aria-label="Share Emmaus">Share</button>,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web',
  },
  registerPlugin: () => ({ get: vi.fn() }),
}));

describe('MemberHeaderActions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('places About Emmaus before My Journey and opens the full copy in a popover', async () => {
    const user = userEvent.setup();
    render(<MemberHeaderActions compact />);

    const aboutTrigger = screen.getByTestId('about-emmaus-trigger');
    const journeyLink = screen.getByTestId('top-my-journey');

    expect(
      aboutTrigger.compareDocumentPosition(journeyLink) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'About Emmaus' })).not.toBeInTheDocument();

    await user.click(aboutTrigger);

    expect(window.location.pathname).toBe('/');
    expect(screen.getByRole('heading', { name: 'About Emmaus' })).toBeInTheDocument();
    expect(screen.getByText(
      'Emmaus is a Christian discipleship app created to help you walk with Jesus, engage with Scripture and stay connected to the life of the Local Church.',
    )).toBeInTheDocument();
    expect(screen.getByText(
      'It offers a calm place to read the Bible, pray, reflect, follow Walks and take your next faithful step with Jesus.',
    )).toBeInTheDocument();
    expect(screen.getByText(
      'Emmaus uses technology—including AI—to assist you, but it does not replace Scripture, the Holy Spirit, pastors, Christian community or the Local Church.',
    )).toBeInTheDocument();
    expect(screen.getByText('Everything in Emmaus is guided by one conviction:')).toBeInTheDocument();
    expect(screen.getByText('It’s All About JESUS.')).toBeInTheDocument();
  });

  it('shows an honest unsupported state when this browser cannot receive push reminders', async () => {
    const user = userEvent.setup();
    render(<MemberHeaderActions compact />);

    await user.click(screen.getByTestId('settings-trigger'));

    expect(screen.getByText('Unsupported on this browser')).toBeInTheDocument();
    expect(screen.getByTestId('toggle-notifications')).toBeDisabled();
  });

  it('shows the rc6 build identity in About Emmaus', async () => {
    const user = userEvent.setup();
    render(<MemberHeaderActions compact />);

    await user.click(screen.getByTestId('about-emmaus-trigger'));

    expect(screen.getByText('Android test build · 1.2.0-rc6 · version code 8')).toBeInTheDocument();
  });

  it('shows the live text-size preview in Settings', async () => {
    const user = userEvent.setup();
    render(<MemberHeaderActions compact />);

    await user.click(screen.getByTestId('settings-trigger'));

    expect(screen.getAllByText('Standard')).toHaveLength(2);
    expect(screen.getByTestId('text-size-preview')).toHaveTextContent(
      'Jesus walks with you through every season.',
    );
  });
});