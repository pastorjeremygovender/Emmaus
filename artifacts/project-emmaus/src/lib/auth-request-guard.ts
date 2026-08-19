import { SESSION_SUBJECT_KEY } from './account-storage';

export const EXPECTED_SUBJECT_HEADER = 'X-Emmaus-Expected-Subject';

const WRAPPED_FETCH = '__emmausExpectedSubjectFetch__' as const;
const AUTH_DISCOVERY_PATHS = new Set([
  '/api/auth/user',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/recover',
]);

type MarkedFetch = typeof fetch & { [WRAPPED_FETCH]?: boolean };

function shouldAssertSubject(input: RequestInfo | URL): boolean {
  try {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.href);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith('/api/') &&
      !AUTH_DISCOVERY_PATHS.has(url.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Adds the tab's last server-verified subject as a consistency assertion.
 * The server still derives identity exclusively from the opaque session. This
 * header can only make a request fail when a shared cookie changed underneath
 * a stale tab; it can never authenticate or select an account.
 */
export function installAuthRequestGuard(): void {
  const currentFetch = globalThis.fetch as MarkedFetch;
  if (currentFetch[WRAPPED_FETCH]) return;

  const underlyingFetch = currentFetch.bind(globalThis);
  const guardedFetch: MarkedFetch = async (input, init) => {
    const subject = sessionStorage.getItem(SESSION_SUBJECT_KEY);
    if (!subject || !shouldAssertSubject(input)) {
      return underlyingFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    headers.set(EXPECTED_SUBJECT_HEADER, subject);
    return underlyingFetch(input, { ...init, headers });
  };
  guardedFetch[WRAPPED_FETCH] = true;
  globalThis.fetch = guardedFetch;
}