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