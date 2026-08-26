import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailyRhythmStartup } from '@/lib/journeys-api';

describe('getDailyRhythmStartup response contract', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it('rejects a successful but incomplete response so the gate can fail closed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ state: 'COMPLETED' }), { status: 200 }),
    );

    await expect(getDailyRhythmStartup()).rejects.toMatchObject({
      code: 'OPENING_RESPONSE_INVALID',
    });
  });

  it('accepts a complete opening decision from the server', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({
        state: 'OPENING_REQUIRED',
        destination: '/daily-rhythm/day/3',
        assignedDay: 3,
      }), { status: 200 }),
    );

    await expect(getDailyRhythmStartup()).resolves.toMatchObject({
      state: 'OPENING_REQUIRED',
      destination: '/daily-rhythm/day/3',
      assignedDay: 3,
    });
  });

  it('reuses the launch session when an offline request is retried', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          state: 'OPENING_REQUIRED',
          destination: '/daily-rhythm/day/1',
          assignedDay: 1,
        }), { status: 200 }),
      );

    await expect(getDailyRhythmStartup()).rejects.toThrow('Failed to fetch');
    await expect(getDailyRhythmStartup()).resolves.toMatchObject({
      state: 'OPENING_REQUIRED',
      destination: '/daily-rhythm/day/1',
    });

    const firstHeaders = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers as HeadersInit);
    const retryHeaders = new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers as HeadersInit);
    expect(firstHeaders.get('X-Emmaus-Startup-Session')).toBeTruthy();
    expect(retryHeaders.get('X-Emmaus-Startup-Session'))
      .toBe(firstHeaders.get('X-Emmaus-Startup-Session'));
  });
});