import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

interface TestRequest {
  method: string;
  mode: string;
  url: string;
  destination: string;
  credentials: string;
  cache: string;
  headers: Headers;
}

function loadWorkerPolicy() {
  const source = readFileSync(
    resolve(process.cwd(), 'public/sw.js'),
    'utf8',
  );

  const context = {
    URL,
    Set,
    Promise,
    fetch: () => Promise.reject(new Error('fetch is not used by policy tests')),
    caches: {
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
      open: () => Promise.reject(new Error('cache is not used by policy tests')),
    },
    self: {
      location: { origin: 'https://emmaus.co.za' },
      addEventListener: () => {},
      skipWaiting: () => {},
      clients: { claim: () => Promise.resolve() },
    },
  };

  runInNewContext(source, context);
  return runInNewContext(
    '({ isSafeStaticRequest, canStore })',
    context,
  ) as {
    isSafeStaticRequest: (request: TestRequest) => boolean;
    canStore: (request: TestRequest, response: Response) => boolean;
  };
}

function request(
  path: string,
  overrides: Partial<TestRequest> = {},
): TestRequest {
  return {
    method: 'GET',
    mode: 'cors',
    url: `https://emmaus.co.za${path}`,
    destination: 'script',
    credentials: 'same-origin',
    cache: 'default',
    headers: new Headers(),
    ...overrides,
  };
}

describe('Emmaus service-worker cache policy', () => {
  const policy = loadWorkerPolicy();

  it('keeps reminder push handling separate from the cache policy', () => {
    const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

    expect(source).toContain("self.addEventListener('push'");
    expect(source).toContain("self.addEventListener('notificationclick'");
    expect(source).toContain("const REMINDER_TITLE = 'A quiet moment with Jesus'");
    expect(source).toContain(
      "const REMINDER_BODY = 'Your next 10 Minutes with Jesus is ready whenever you are.'",
    );
    expect(source).toContain("const REMINDER_URL = '/daily-rhythm/navigate'");
    expect(source).toContain('self.registration.showNotification');
    expect(source).toContain("self.clients.matchAll({ type: 'window', includeUncontrolled: true })");
    expect(source).toContain('self.clients.openWindow(url)');
    expect(source).toContain("if (!isSafeStaticRequest(event.request)) return;");
  });

  it('allows generated hashed Vite assets', () => {
    expect(
      policy.isSafeStaticRequest(
        request('/assets/index-uwDat7Up.js'),
      ),
    ).toBe(true);
    expect(
      policy.isSafeStaticRequest(
        request('/assets/index-BC3gZ9cM.css', { destination: 'style' }),
      ),
    ).toBe(true);
  });

  it('allows only the explicit branded icon files', () => {
    expect(
      policy.isSafeStaticRequest(
        request('/icons/icon-192.png', { destination: 'image' }),
      ),
    ).toBe(true);
    expect(
      policy.isSafeStaticRequest(
        request('/icons/member-avatar.png', { destination: 'image' }),
      ),
    ).toBe(false);
  });

  it('rejects navigation, API, non-hashed, queried, and authenticated requests', () => {
    expect(
      policy.isSafeStaticRequest(request('/walk', { mode: 'navigate' })),
    ).toBe(false);
    expect(
      policy.isSafeStaticRequest(request('/api/journeys/member')),
    ).toBe(false);
    expect(
      policy.isSafeStaticRequest(request('/assets/private-profile.json')),
    ).toBe(false);
    expect(
      policy.isSafeStaticRequest(request('/assets/index-uwDat7Up.js?v=2')),
    ).toBe(false);
    expect(
      policy.isSafeStaticRequest(
        request('/assets/index-uwDat7Up.js', {
          headers: new Headers({ Authorization: 'Bearer test' }),
        }),
      ),
    ).toBe(false);
    expect(
      policy.isSafeStaticRequest(
        request('/assets/index-uwDat7Up.js', { credentials: 'include' }),
      ),
    ).toBe(false);
  });

  it('does not store private, no-store, redirected, or unexpected content', () => {
    const jsRequest = request('/assets/index-uwDat7Up.js');
    const basicResponse = (headers: Record<string, string>) =>
      ({
        ok: true,
        type: 'basic',
        redirected: false,
        headers: new Headers(headers),
      }) as Response;

    expect(
      policy.canStore(
        jsRequest,
        basicResponse({ 'Content-Type': 'text/javascript' }),
      ),
    ).toBe(true);
    expect(
      policy.canStore(
        jsRequest,
        basicResponse({
          'Content-Type': 'text/javascript',
          'Cache-Control': 'private',
        }),
      ),
    ).toBe(false);
    expect(
      policy.canStore(
        jsRequest,
        basicResponse({
          'Content-Type': 'text/javascript',
          'Cache-Control': 'no-store',
        }),
      ),
    ).toBe(false);
    expect(
      policy.canStore(
        jsRequest,
        basicResponse({ 'Content-Type': 'application/json' }),
      ),
    ).toBe(false);
  });
});