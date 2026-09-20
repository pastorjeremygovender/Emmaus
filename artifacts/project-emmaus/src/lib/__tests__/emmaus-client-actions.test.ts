import { describe, expect, it, vi } from 'vitest';
import { executeValidatedEmmausAction } from '@/lib/emmaus-client';

describe('validated Emmaus action navigation', () => {
  it('navigates to the server-owned Walk route', () => {
    const setLocation = vi.fn();

    const executed = executeValidatedEmmausAction(
      {
        kind: 'OPEN',
        targetType: 'capability',
        targetId: 'todays-steps',
        label: "Open Today's Steps",
        route: '/walk',
      },
      setLocation,
    );

    expect(executed).toBe(true);
    expect(setLocation).toHaveBeenCalledOnce();
    expect(setLocation).toHaveBeenCalledWith('/walk');
  });

  it('rejects routes that are not safe internal destinations', () => {
    const setLocation = vi.fn();

    expect(executeValidatedEmmausAction({ route: 'https://example.com' }, setLocation)).toBe(false);
    expect(executeValidatedEmmausAction({ route: '//example.com' }, setLocation)).toBe(false);
    expect(executeValidatedEmmausAction({ route: '/walk\n/admin' }, setLocation)).toBe(false);
    expect(setLocation).not.toHaveBeenCalled();
  });
});