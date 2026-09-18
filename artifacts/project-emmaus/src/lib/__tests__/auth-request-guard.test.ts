import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_SUBJECT_KEY } from '@/lib/account-storage';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('installAuthRequestGuard', () => {
  it('asserts the verified tab subject on same-origin API requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = fetchMock;
    sessionStorage.setItem(SESSION_SUBJECT_KEY, 'subject-a');
    const { installAuthRequestGuard } = await import('@/lib/auth-request-guard');

    installAuthRequestGuard();
    await fetch('/api/journeys/progress', { method: 'POST' });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get('X-Emmaus-Expected-Subject')).toBe('subject-a');
  });

  it('does not assert a stale subject on the session discovery request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    globalThis.fetch = fetchMock;
    sessionStorage.setItem(SESSION_SUBJECT_KEY, 'subject-a');
    const { installAuthRequestGuard } = await import('@/lib/auth-request-guard');

    installAuthRequestGuard();
    await fetch('/api/auth/user');

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has('X-Emmaus-Expected-Subject')).toBe(false);
  });
});