import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { safeOpeningDestination } from './opening-destination';

type NativeDeepLink = {
  path?: string;
  source?: string;
};

type DailyRhythmDeepLinkPlugin = {
  getPendingDeepLink(): Promise<NativeDeepLink>;
  addListener(
    eventName: 'deepLink',
    listenerFunc: (event: NativeDeepLink) => void,
  ): Promise<PluginListenerHandle>;
};

const deepLink = registerPlugin<DailyRhythmDeepLinkPlugin>('DailyRhythmDeepLink');

function safeWidgetPath(path: string | undefined): string | null {
  if (!path) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(path, window.location.origin);
  } catch {
    return null;
  }
  if (
    url.pathname.match(/^\/daily-rhythm\/day\/[1-9][0-9]*$/) === null ||
    url.searchParams.get('source') !== 'widget' ||
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
  return safeOpeningDestination(`${canonical.pathname}${canonical.search}`);
}

function applyWidgetPath(path: string | undefined, replace: boolean): void {
  const safePath = safeWidgetPath(path);
  if (!safePath) return;

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === safePath) return;

  if (replace) {
    window.history.replaceState({ ...window.history.state, source: 'widget' }, '', safePath);
  } else {
    window.history.pushState({ ...window.history.state, source: 'widget' }, '', safePath);
  }
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

/**
 * Consume cold-start widget intents before the router renders, and handle
 * subsequent taps while the singleTask Android activity is already running.
 */
export async function installNativeDailyRhythmDeepLink(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

  try {
    await deepLink.addListener('deepLink', event => applyWidgetPath(event.path, false));
    const pending = await deepLink.getPendingDeepLink();
    applyWidgetPath(pending.path, true);
  } catch {
    // Browser builds and older native shells simply have no widget handoff.
  }
}