import { Button } from '@/components/ui/button';

export type BrowseMode = 'groups' | 'all';

interface Props {
  value: BrowseMode;
  onChange: (value: BrowseMode) => void;
}

export function BrowseModeToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border bg-muted/30 p-1" role="group" aria-label="Browse mode">
      <Button
        type="button"
        size="sm"
        variant={value === 'groups' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'groups'}
        className="h-8 rounded-lg px-3 text-xs"
        onClick={() => onChange('groups')}
      >
        View Groups
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'all' ? 'secondary' : 'ghost'}
        aria-pressed={value === 'all'}
        className="h-8 rounded-lg px-3 text-xs"
        onClick={() => onChange('all')}
      >
        View All
      </Button>
    </div>
  );
}