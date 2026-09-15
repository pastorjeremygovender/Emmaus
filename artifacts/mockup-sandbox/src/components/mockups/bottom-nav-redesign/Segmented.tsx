import { BookOpen, Footprints } from 'lucide-react';
import './_group.css';

const ITEMS = [
  { path: '/walk', label: 'My Emmaus', icon: Footprints },
  { path: '/bible', label: 'My Bible', icon: BookOpen },
] as const;

function SegmentedBottomNav() {
  return (
    <nav
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-6 pt-5"
      aria-label="Primary"
    >
      <div className="pointer-events-auto grid w-[min(21rem,calc(100vw-2rem))] grid-cols-2 rounded-full border border-border/80 bg-muted/70 p-1 shadow-[0_3px_12px_rgba(37,44,42,0.08)] backdrop-blur-md">
        {ITEMS.map(({ path, label, icon: Icon }, index) => {
          const active = index === 0;
          return (
            <a
              key={path}
              href={path}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold',
                'transition-[background-color,color,box-shadow,transform] duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                active
                  ? 'bg-background text-foreground shadow-[0_1px_4px_rgba(37,44,42,0.12)]'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              <Icon size={17} strokeWidth={2.1} aria-hidden="true" />
              <span>{label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export function Segmented() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto max-w-sm px-6 pt-8">
        <div className="h-2 w-20 rounded-full bg-primary/15" />
        <div className="mt-4 h-3 w-44 rounded-full bg-muted" />
        <div className="mt-3 h-3 w-64 rounded-full bg-muted/70" />
        <div className="mt-10 h-28 rounded-2xl border border-border/70 bg-card/70" />
      </div>
      <SegmentedBottomNav />
    </div>
  );
}