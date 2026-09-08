import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/pages/rooms/CreateRoom.tsx'), 'utf8');

describe('CreateRoom group-name example', () => {
  it('uses a neutral placeholder and no real-person family name', () => {
    expect(source).not.toContain('The Govender Family');
    expect(source).toContain('placeholder="e.g. Family Group"');
  });
});