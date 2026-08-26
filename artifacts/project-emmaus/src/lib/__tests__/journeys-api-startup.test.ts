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
});