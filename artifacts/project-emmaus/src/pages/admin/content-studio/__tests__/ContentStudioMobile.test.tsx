import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlock, type Block } from '@/lib/blocks';
import EmmausContentEditor from '../EmmausContentEditor';
import BlockCanvas from '../BlockCanvas';
import DevotionalSeriesEditor from '../DevotionalSeriesEditor';

const mocks = vi.hoisted(() => ({
  getSeriesWithEntries: vi.fn(),
  updateSeries: vi.fn(),
  saveEntry: vi.fn(),
  deleteEntry: vi.fn(),
  bulkGenerateEntryLabels: vi.fn(),
}));

vi.mock('@/lib/journeys-api', () => ({ aiBlockAction: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'admin-1', role: 'admin' } }),
}));
vi.mock('@/lib/devotionals-api', () => ({
  getSeriesWithEntries: mocks.getSeriesWithEntries,
  updateSeries: mocks.updateSeries,
  saveEntry: mocks.saveEntry,
  deleteEntry: mocks.deleteEntry,
  bulkGenerateEntryLabels: mocks.bulkGenerateEntryLabels,
}));

describe('Content Studio mobile authoring controls', () => {
  beforeEach(() => {
    mocks.getSeriesWithEntries.mockResolvedValue({
      id: 'series-1',
      title: 'Mobile Series',
      description: 'A series ready to edit on a phone.',
      seriesType: 'general',
      status: 'Draft',
      entries: [{
        id: 'entry-1',
        dayNumber: 1,
        title: 'Day one',
        scriptureReference: 'John 1:1',
        status: 'Draft',
      }],
    });
    mocks.updateSeries.mockResolvedValue(undefined);
    mocks.saveEntry.mockResolvedValue(undefined);
    mocks.deleteEntry.mockResolvedValue(undefined);
    mocks.bulkGenerateEntryLabels.mockResolvedValue({ updated: 0 });
  });

  it('opens the real member preview in an accessible mobile sheet', async () => {
    const user = userEvent.setup();
    render(
      <EmmausContentEditor
        toolbar={<div>Editor toolbar</div>}
        fields={<div>Editable fields</div>}
        preview={<div>Member-facing preview body</div>}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const dialog = screen.getByRole('dialog', { name: 'Member preview' });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('Member-facing preview body')).toBeTruthy();

    await user.click(within(dialog).getAllByRole('button', { name: 'Close preview' })[1]);
    expect(screen.queryByRole('dialog', { name: 'Member preview' })).toBeNull();
  });

  it('keeps block reordering available without drag-and-drop', async () => {
    const user = userEvent.setup();
    const first = { ...createBlock('paragraph'), id: 'first' } as Block;
    const second = { ...createBlock('paragraph'), id: 'second' } as Block;
    const onChange = vi.fn();

    render(<BlockCanvas blocks={[first, second]} onChange={onChange} />);

    await user.click(screen.getAllByRole('button', { name: 'Move block down' })[0]);
    expect(onChange).toHaveBeenLastCalledWith([second, first]);

    await user.click(screen.getAllByRole('button', { name: 'Move block up' })[1]);
    expect(onChange).toHaveBeenLastCalledWith([second, first]);
  });

  it('keeps devotional series settings reachable from the mobile editor surface', async () => {
    const user = userEvent.setup();
    render(
      <DevotionalSeriesEditor
        seriesId="series-1"
        onBack={vi.fn()}
        onEditEntry={vi.fn()}
      />,
    );

    await screen.findByText('Day one');
    await user.click(screen.getByRole('button', { name: /Series settings/i }));
    expect(screen.getByRole('button', { name: 'Close settings' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(
      screen.getByRole('button', { name: 'Close settings' }).closest('div[class*="hidden"]'),
    ).toBeTruthy();
  });
});