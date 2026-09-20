import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const isNativePlatform = vi.hoisted(() => vi.fn());

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform,
  },
}));

describe('registerServiceWorker', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const originalCaches = Object.getOwnPropertyDescriptor(window, 'caches');

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    isNativePlatform.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
    if (originalCaches) {
      Object.defineProperty(window, 'caches', originalCaches);
    } else {
      Reflect.deleteProperty(window, 'caches');
    }
  });

  it('cleans native service workers and Emmaus caches without registering sw.js', async () => {
    const registrations = [
      { unregister: vi.fn(() => Promise.resolve(true)) },
      { unregister: vi.fn(() => Promise.resolve(true)) },
    ];
    const getRegistrations = vi.fn(() => Promise.resolve(registrations));
    const register = vi.fn();
    const keys = vi.fn(() =>
      Promise.resolve(['emmaus-static-v2-restore', 'other-cache', 'emmaus-static-old']),
    );
    const deleteCache = vi.fn(() => Promise.resolve(true));

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistrations, register },
    });
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys, delete: deleteCache },
    });

    const { registerServiceWorker } = await import('../register-service-worker');
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(deleteCache).toHaveBeenCalledTimes(2));

    expect(getRegistrations).toHaveBeenCalledTimes(1);
    expect(registrations[0].unregister).toHaveBeenCalledTimes(1);
    expect(registrations[1].unregister).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith('emmaus-static-v2-restore');
    expect(deleteCache).toHaveBeenCalledWith('emmaus-static-old');
    expect(deleteCache).not.toHaveBeenCalledWith('other-cache');
    expect(register).not.toHaveBeenCalled();
  });
});