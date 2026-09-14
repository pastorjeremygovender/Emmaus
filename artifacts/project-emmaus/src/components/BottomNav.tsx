import { useLocation } from 'wouter';
import { Footprints, BookOpen } from 'lucide-react';

const ITEMS = [
  { path: '/walk', label: 'My Emmaus', icon: Footprints },
  { path: '/bible', label: 'My Bible', icon: BookOpen },
] as const;

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  return (
    <nav
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 flex justify-center bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-5"
      aria-label="Primary"
    >
      <div className="pointer-events-auto grid w-[min(22rem,calc(100vw-2rem))] grid-cols-2 rounded-full border border-primary/25 bg-background/95 p-1 shadow-sm backdrop-blur">
        {ITEMS.map(({ path, label, icon: Icon }) => {
          const active = path === '/walk'
            ? location === '/walk' || location.startsWith('/daily-rhythm')
            : location === '/bible' || location.startsWith('/bible/');
          return (
            <a
              key={path}
              href={`${base}${path}`}
              onClick={event => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                setLocation(path);
              }}
              data-testid={`nav-${path.slice(1)}`}
              className={`flex min-h-[48px] items-center justify-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition-colors ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-primary'}`}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
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
