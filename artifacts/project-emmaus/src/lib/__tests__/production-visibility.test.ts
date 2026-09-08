import { describe, expect, it } from 'vitest';

import { shouldShowPrivilegedDemoShortcuts } from '../production-visibility';

describe('production demo shortcut visibility', () => {
  it('hides privileged demo shortcuts in production demo mode', () => {
    expect(shouldShowPrivilegedDemoShortcuts(true, true)).toBe(false);
  });

  it('keeps privileged demo shortcuts available in development demo mode', () => {
    expect(shouldShowPrivilegedDemoShortcuts(true, false)).toBe(true);
  });

  it('never shows privileged demo shortcuts outside demo mode', () => {
    expect(shouldShowPrivilegedDemoShortcuts(false, false)).toBe(false);
  });
});