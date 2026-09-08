import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/pages/DevotionalNavigatorPage.tsx'),
  'utf8',
);

describe('DevotionalNavigatorPage group back navigation contract', () => {
  it('unwinds the group route instead of pushing the parent navigator route', () => {
    expect(source).toContain(
      'goBackOrFallback(`/devotional/${seriesId}/navigate`, setLocation)',
    );
    expect(source).not.toContain(
      'setLocation(`/devotional/${seriesId}/navigate`)',
    );
  });
});