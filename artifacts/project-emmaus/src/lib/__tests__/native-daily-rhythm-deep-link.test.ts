import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  listener: undefined as ((event: { path?: string }) => void) | undefined,
  pending: { path: '/daily-rhythm/day/4?source=widget&version=1&journeyId=daily-rhythm&stepId=step-4' },
  addListener: vi.fn(async (_event: string, callback: (event: { path?: string }) => void) => {
    native.listener = callback;
    return { remove: vi.fn() };
  }),
  getPendingDeepLink: vi.fn(async () => native.pending),
  acknowledgePendingDeepLink: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
  },
  registerPlugin: () => native,
}));

import { installNativeDailyRhythmDeepLink } from '../native-daily-rhythm-deep-link';

describe('native Daily Rhythm widget deep-link handoff', () => {
  beforeEach(() => {
    native.listener = undefined;
    native.pending = { path: '/daily-rhythm/day/4?source=widget&version=1&journeyId=daily-rhythm&stepId=step-4' };
    native.addListener.mockClear();
    native.getPendingDeepLink.mockClear();
    native.acknowledgePendingDeepLink.mockClear();
    window.history.replaceState({}, '', '/walk');
  });

  it('opens the exact displayed entry on a cold start', async () => {
    await installNativeDailyRhythmDeepLink();

    expect(window.location.pathname).toBe('/daily-rhythm/day/4');
    expect(window.location.search).toBe('?source=widget&version=1&journeyId=daily-rhythm&stepId=step-4');
    expect(native.getPendingDeepLink).toHaveBeenCalledOnce();
  });

  it('pushes a new route when the already-running activity receives a widget tap', async () => {
    await installNativeDailyRhythmDeepLink();
    native.listener?.({ path: '/daily-rhythm/day/5?source=widget&version=1&journeyId=daily-rhythm&stepId=step-5' });

    expect(window.location.pathname).toBe('/daily-rhythm/day/5');
    expect(window.location.search).toBe('?source=widget&version=1&journeyId=daily-rhythm&stepId=step-5');
    expect(window.history.length).toBeGreaterThan(1);
  });

  it('rejects routes that are not widget-owned Daily Rhythm destinations', async () => {
    native.pending = { path: '/walk?source=widget' };
    await installNativeDailyRhythmDeepLink();

    expect(window.location.pathname).toBe('/walk');
    expect(window.location.search).toBe('');
  });

  it('hands a native reminder tap to the authenticated Personal destination', async () => {
    native.pending = { path: '/personal?source=notification' };
    await installNativeDailyRhythmDeepLink();

    expect(window.location.pathname).toBe('/personal');
    expect(window.location.search).toBe('?source=notification');
  });
});