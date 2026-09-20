/**
 * Register the Emmaus service worker only in production builds.
 *
 * Registration is deliberately non-blocking: the online app remains fully
 * functional if service workers are unavailable or registration fails.
 */
export function registerServiceWorker(): void {
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
        .then((registration) => registration.update())
        .catch((error: unknown) => {
          console.warn('Emmaus service worker registration failed:', error);
        });
    },
    { once: true },
  );
}
