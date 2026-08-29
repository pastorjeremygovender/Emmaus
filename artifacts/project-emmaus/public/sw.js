/*
 * Emmaus service worker
 *
 * Safety policy:
 * - Never intercept page navigations.
 * - Never intercept /api requests or other dynamic/authenticated requests.
 * - Cache only same-origin build assets and branded static icons.
 * - Respect private/no-store response headers.
 *
 * This keeps user, admin, Bible, Ask Emmaus, and progress data network-owned.
 */

const STATIC_CACHE = 'emmaus-static-v1';
const EMMAUS_CACHE_PREFIX = 'emmaus-static-';
const HASHED_VITE_ASSET =
  /(^|\/)assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(css|js|mjs|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif)$/i;
const BRANDED_ICON =
  /\/icons\/(icon-(192|512)|icon-maskable-(192|512)|apple-touch-icon|favicon-32)\.png$|\/icons\/favicon\.ico$|\/favicon\.(ico|png|svg)$/i;
const SAFE_DESTINATIONS = new Set(['script', 'style', 'font', 'image']);

function isSafeStaticRequest(request) {
  if (request.method !== 'GET' || request.mode === 'navigate') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (/(^|\/)api(\/|$)/.test(url.pathname)) return false;
  if (url.search) return false;
  if (!SAFE_DESTINATIONS.has(request.destination)) return false;
  if (request.credentials === 'include') return false;
  if (request.cache === 'no-store') return false;
  if (request.headers.has('Authorization')) return false;

  return HASHED_VITE_ASSET.test(url.pathname) || BRANDED_ICON.test(url.pathname);
}

function hasExpectedContentType(request, response) {
  const pathname = new URL(request.url).pathname.toLowerCase();
  const contentType = (response.headers.get('Content-Type') || '').toLowerCase();

  if (/\.(js|mjs)$/.test(pathname)) return /javascript|ecmascript/.test(contentType);
  if (/\.css$/.test(pathname)) return contentType.includes('text/css');
  if (/\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(pathname)) {
    return contentType.startsWith('image/');
  }
  if (/\.(woff2?|ttf|otf)$/.test(pathname)) {
    return /font|application\/octet-stream/.test(contentType);
  }
  return false;
}

function canStore(request, response) {
  if (
    !response ||
    !response.ok ||
    response.type !== 'basic' ||
    response.redirected
  ) {
    return false;
  }

  const cacheControl = response.headers.get('Cache-Control') || '';
  return (
    !/(private|no-store)/i.test(cacheControl) &&
    hasExpectedContentType(request, response)
  );
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(EMMAUS_CACHE_PREFIX) && key !== STATIC_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (!isSafeStaticRequest(event.request)) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (canStore(event.request, response)) {
        await cache.put(event.request, response.clone());
      }
      return response;
    }),
  );
});

const REMINDER_TITLE = 'A quiet moment with Jesus';
const REMINDER_BODY = 'Your next 10 Minutes with Jesus is ready whenever you are.';
const REMINDER_URL = '/daily-rhythm/navigate';

function safeReminderUrl(value, absolute) {
  try {
    const parsed = new URL(value, self.location.origin);
    if (parsed.origin !== self.location.origin) throw new Error('cross-origin notification URL');
    return absolute ? parsed.href : parsed.pathname + parsed.search;
  } catch {
    const fallback = new URL(REMINDER_URL, self.location.origin);
    return absolute ? fallback.href : REMINDER_URL;
  }
}

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === 'string' ? payload.title : REMINDER_TITLE;
  const body = typeof payload.body === 'string' ? payload.body : REMINDER_BODY;
  const requestedUrl = typeof payload.url === 'string' ? payload.url : REMINDER_URL;
  const url = safeReminderUrl(requestedUrl, false);

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeReminderUrl(
    event.notification.data && event.notification.data.url || REMINDER_URL,
    true,
  );

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const matchingClient = clients.find((client) => new URL(client.url).origin === self.location.origin);
      if (matchingClient) {
        return matchingClient.navigate(url).then(() => matchingClient.focus());
      }
      return self.clients.openWindow(url);
    }),
  );
});