import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(process.cwd(), 'src/pages/PreviousDays.tsx'),
  'utf8',
);

describe('Daily Rhythm day-list contract', () => {
  it('lists every published day and uses genuine completion records', () => {
    expect(source).toContain("filter(s => s.status === 'Published' && !s.isCompletionStep)");
    expect(source).toContain("const completed = completedSet.has(s.day);");
    expect(source).toContain("statusLabel: completed ? 'Completed' : 'Open'");
    expect(source).toContain("label: s.day === assignedDay ? 'Today'");
  });

  it('does not derive entries from calendar history or hide future days', () => {
    expect(source).not.toContain('history?.entries');
    expect(source).not.toContain('s.day < currentDay');
    expect(source).not.toContain('entry.localDate <');
  });
});