import { describe, expect, it } from 'vitest';
import { isMemberAppUserAgent } from '@/lib/app-target';

describe('Emmaus app target', () => {
  it('recognises the member-only Android wrapper', () => {
    expect(isMemberAppUserAgent('Mozilla/5.0 EmmausMemberApp/1')).toBe(true);
  });

  it('leaves ordinary browsers as the web/admin target', () => {
    expect(isMemberAppUserAgent('Mozilla/5.0 Chrome/140')).toBe(false);
  });
});
