export type BrowseMode = 'groups' | 'all';

interface Props {
  value: BrowseMode;
  onChange: (value: BrowseMode) => void;
}

export function BrowseModeToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex items-center rounded-lg border border-border/70 bg-muted/30 p-0.5"
      role="group"
      aria-label="Browse mode"
    >
      <button
        type="button"
        aria-pressed={value === 'groups'}
        className={`h-7 rounded-md px-2.5 text-[11px] font-medium transition-all ${
          value === 'groups'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onChange('groups')}
      >
        View Groups
      </button>
      <button
        type="button"
        aria-pressed={value === 'all'}
        className={`h-7 rounded-md px-2.5 text-[11px] font-medium transition-all ${
          value === 'all'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => onChange('all')}
      >
        View All
      </button>
    </div>
  );
}