import { useLocation } from 'wouter';
import { Footprints, BookOpen } from 'lucide-react';
import { getReturnDestination } from '@/lib/emmaus-pending';

// Navigation order (locked):
// 1. Today's Steps  /walk
// 2. My Bible       /bible
// Discover and My Journey are accessed from the top header and Walk cards.

export function BottomNav() {
  const [location] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  const navItems = [
    { path: '/walk',      label: "Today's Steps", icon: Footprints },
    { path: '/bible',     label: 'My Bible',      icon: BookOpen },
  ];

  function isActive(path: string): boolean {
    // While Ask Emmaus is open, highlight the section the user came from
    // rather than falsely highlighting Personal.
    if (location.startsWith('/personal/ask-emmaus')) {
      const dest = getReturnDestination();
      if (dest) {
        const sectionPath: Record<string, string> = {
          walk: '/walk',
          bible: '/bible',
          journeys: '/journeys',
          personal: '/personal',
        };
        return path === sectionPath[dest.sourceSection];
      }
      // No stored destination — suppress highlighting entirely on Ask Emmaus screens.
      return false;
    }

    if (path === '/walk')     return (
      location === '/walk' ||
      location.startsWith('/daily-rhythm/')
    );
    if (path === '/bible')    return location === '/bible' || location.startsWith('/bible/');
    if (path === '/journeys') return location === '/journeys' || location.startsWith('/journey/');
    if (path === '/personal') {
      return (
        location === '/personal' ||
        (location.startsWith('/personal/') && !location.startsWith('/personal/ask-emmaus'))
      );
    }
    return false;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-[0_-8px_24px_hsl(var(--background)/0.92)] safe-area-bottom">
      <nav className="flex h-16 items-center justify-center gap-4" aria-label="Main navigation">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <a
              key={path}
              href={`${base}${path}`}
              data-testid={`nav-${path.slice(1)}`}
              className="relative flex h-full min-h-[44px] w-28 shrink-0 flex-col items-center justify-center gap-1 px-1"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <span className="absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
              )}
              <Icon
                size={21}
                className={`shrink-0 transition-colors ${active ? 'text-primary' : 'text-muted-foreground'}`}
                strokeWidth={active ? 2.5 : 1.8}
                aria-hidden="true"
              />
              <span
                className={`text-center text-[10px] font-medium leading-tight tracking-tight transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
