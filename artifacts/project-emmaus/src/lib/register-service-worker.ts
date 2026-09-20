/**
 * Register the Emmaus service worker only in production builds.
 *
 * Registration is deliberately non-blocking: the online app remains fully
 * functional if service workers are unavailable or registration fails.
 */
import { Capacitor } from '@capacitor/core';

const EMMAUS_CACHE_PREFIX = 'emmaus-static-';

export function registerServiceWorker(): void {
  if (Capacitor.isNativePlatform()) {
    window.addEventListener(
      'load',
      () => {
        const unregisterServiceWorkers =
          'serviceWorker' in navigator
            ? navigator.serviceWorker
                .getRegistrations()
                .then(registrations =>
                  Promise.all(registrations.map(registration => registration.unregister())),
                )
            : Promise.resolve();

        const clearEmmausCaches =
          'caches' in window
            ? caches
                .keys()
                .then(keys =>
                  Promise.all(
                    keys
                      .filter(key => key.startsWith(EMMAUS_CACHE_PREFIX))
                      .map(key => caches.delete(key)),
                  ),
                )
            : Promise.resolve();

        void Promise.all([unregisterServiceWorkers, clearEmmausCaches]).catch((error: unknown) => {
          console.warn('Emmaus native service worker cleanup failed:', error);
        });
      },
      { once: true },
    );
    return;
  }

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener(
    'load',
    () => {
      const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
      const serviceWorkerUrl = new URL('sw.js', baseUrl);

      navigator.serviceWorker
        .register(serviceWorkerUrl, {
          scope: baseUrl.pathname,
          updateViaCache: 'none',
        })
        .catch((error: unknown) => {
          console.warn('Emmaus service worker registration failed:', error);
        });
    },
    { once: true },
  );
}