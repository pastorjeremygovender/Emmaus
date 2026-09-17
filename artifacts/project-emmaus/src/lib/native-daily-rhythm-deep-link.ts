import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { safeOpeningDestination } from './opening-destination';

type NativeDeepLink = {
  path?: string;
  source?: 'widget' | 'notification';
};

type DailyRhythmDeepLinkPlugin = {
  getPendingDeepLink(): Promise<NativeDeepLink>;
  acknowledgePendingDeepLink(options: { path: string }): Promise<void>;
  addListener(
    eventName: 'deepLink',
    listenerFunc: (event: NativeDeepLink) => void,
  ): Promise<PluginListenerHandle>;
};

const deepLink = registerPlugin<DailyRhythmDeepLinkPlugin>('DailyRhythmDeepLink');
let activeNativeWidgetPath: string | null = null;

function safeNativePath(path: string | undefined): string | null {
  if (!path) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(path, window.location.origin);
  } catch {
    return null;
  }
  const source = url.searchParams.get('source');
  if (source === 'notification' && url.pathname === '/personal') {
    return '/personal?source=notification';
  }
  if (
    url.pathname.match(/^\/daily-rhythm\/day\/[1-9][0-9]*$/) === null ||
    source !== 'widget' ||
    (url.searchParams.get('version') !== null && url.searchParams.get('version') !== '1')
  ) {
    return null;
  }

  const canonical = new URL(url.pathname, window.location.origin);
  canonical.searchParams.set('source', 'widget');
  canonical.searchParams.set('version', '1');
  for (const key of ['journeyId', 'stepId']) {
    const value = url.searchParams.get(key);
    if (value && value.length <= 160) canonical.searchParams.set(key, value);
  }
  if (url.searchParams.get('widgetFallback') === 'unavailable') {
    canonical.searchParams.set('widgetFallback', 'unavailable');
  }
  return safeOpeningDestination(`${canonical.pathname}${canonical.search}`);
}

function applyNativePath(path: string | undefined, replace: boolean): string | null {
  const safePath = safeNativePath(path);
  if (!safePath) return null;
  activeNativeWidgetPath = safePath;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === safePath) return safePath;

  if (replace) {
    window.history.replaceState(
      { ...window.history.state, source: new URL(safePath, window.location.origin).searchParams.get('source') },
      '',
      safePath,
    );
  } else {
    window.history.pushState(
      { ...window.history.state, source: new URL(safePath, window.location.origin).searchParams.get('source') },
      '',
      safePath,
    );
  }
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  return safePath;
}

/**
 * Consume cold-start widget intents before the router renders, and handle
 * subsequent taps while the singleTask Android activity is already running.
 */
export function installNativeDailyRhythmDeepLink(): Promise<string | null> {
  return (async () => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;

    try {
      await deepLink.addListener('deepLink', event => applyNativePath(event.path, false));
      const pending = await deepLink.getPendingDeepLink();
      return applyNativePath(pending.path, true);
    } catch {
      // Browser builds and older native shells simply have no widget handoff.
      return null;
    }
  })();
}

/**
 * Normal root launches wait briefly for the native bridge to deliver a cold
 * widget intent. This does not block React mounting; it only prevents Welcome
 * from racing a valid widget route with its normal /walk redirect.
 */
export async function waitForNativeDailyRhythmDeepLink(): Promise<string | null> {
  return Promise.race([
    installNativeDailyRhythmDeepLink(),
    new Promise<null>(resolve => window.setTimeout(() => resolve(null), 1200)),
  ]);
}

/**
 * The route remains persisted in the native bridge until the Daily Rhythm
 * reader has validated and rendered the referenced step.
 */
export function acknowledgeNativeDailyRhythmDeepLink(): void {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;
  const source = new URLSearchParams(window.location.search).get('source');
  if (source !== 'widget' && source !== 'notification') return;
  const path = activeNativeWidgetPath ?? `${window.location.pathname}${window.location.search}`;
  void deepLink.acknowledgePendingDeepLink({ path }).then(() => {
    activeNativeWidgetPath = null;
  }).catch(() => {
    // The pending route remains native and can be retried on the next mount.
  });
}