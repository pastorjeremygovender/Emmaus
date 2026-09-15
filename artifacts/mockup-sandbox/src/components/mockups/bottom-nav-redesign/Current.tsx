import { BookOpen, Footprints } from 'lucide-react';
import './_group.css';

const ITEMS = [
  { path: '/walk', label: 'My Emmaus', icon: Footprints },
  { path: '/bible', label: 'My Bible', icon: BookOpen },
] as const;

function CurrentBottomNav() {
  return (
    <nav
      className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-6 pt-5"
      aria-label="Primary"
    >
      <div className="pointer-events-auto grid w-[min(22rem,calc(100vw-2rem))] grid-cols-2 rounded-full border border-primary/25 bg-background/95 p-1 shadow-sm backdrop-blur">
        {ITEMS.map(({ path, label, icon: Icon }, index) => {
          const active = index === 0;
          return (
            <a
              key={path}
              href={path}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition-colors ${
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-primary'
              }`}
            >
              <Icon size={19} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

export function Current() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="mx-auto max-w-sm px-6 pt-8">
        <div className="h-2 w-20 rounded-full bg-primary/15" />
        <div className="mt-4 h-3 w-44 rounded-full bg-muted" />
        <div className="mt-3 h-3 w-64 rounded-full bg-muted/70" />
        <div className="mt-10 h-28 rounded-2xl border border-border/70 bg-card/70" />
      </div>
      <CurrentBottomNav />
    </div>
  );
}