import type { ReactNode } from 'react';

export interface ContentStepListItem {
  key: string | number;
  index: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  completed?: boolean;
  current?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  onClick?: () => void;
}

export function ContentStepRow(item: ContentStepListItem) {
  return (
    <button
      key={item.key}
      type="button"
      disabled={item.disabled}
      className={`w-full flex items-start gap-3 px-4 py-3.5 transition-colors text-left ${
        item.disabled
          ? 'bg-card opacity-40 cursor-default'
          : item.current
            ? 'bg-primary/5 hover:bg-primary/10 active:bg-primary/15'
            : 'bg-card hover:bg-muted/40 active:bg-muted/60'
      }`}
      onClick={item.disabled ? undefined : item.onClick}
      aria-label={item.ariaLabel}
    >
      <span className={`text-[12px] font-medium w-6 shrink-0 mt-0.5 ${
        item.completed || item.current ? 'text-primary' : 'text-muted-foreground'
      }`}>
        {item.index}
      </span>
      <span className="flex-1 min-w-0">
        <span className={`text-[14px] leading-snug block ${
          item.completed ? 'text-muted-foreground' : 'text-foreground'
        }`}>
          {item.title}
        </span>
        {item.subtitle && (
          <span className={`text-[12px] leading-snug block mt-0.5 ${
            item.completed ? 'text-muted-foreground/70' : 'text-muted-foreground'
          }`}>
            {item.subtitle}
          </span>
        )}
      </span>
      <span className={`ml-auto text-[11px] font-medium shrink-0 mt-0.5 ${
        item.current || item.completed ? 'text-primary' : 'text-muted-foreground'
      }`}>
        {item.current ? 'Up next →' : item.completed ? 'Review →' : '→'}
      </span>
    </button>
  );
}

export function ContentStepList({ items }: { items: ContentStepListItem[] }) {
  return (
    <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
      {items.map(item => <ContentStepRow key={item.key} {...item} />)}
    </div>
  );
}