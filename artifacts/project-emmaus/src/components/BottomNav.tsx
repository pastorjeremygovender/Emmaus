import { Link, useLocation } from 'wouter';
import { Footprints, BookOpen, Compass, User } from 'lucide-react';
import { getReturnDestination } from '@/lib/emmaus-pending';

// Navigation order (locked):
// 1. Today's Steps  /walk
// 2. Next Steps     /journeys
// 3. My Bible       /bible
// 4. My Journey     /personal

export function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    { path: '/walk',      label: "Today's Steps", icon: Footprints },
    { path: '/journeys',  label: 'Next Steps',    icon: Compass },
    { path: '/bible',     label: 'My Bible',      icon: BookOpen },
    { path: '/personal',  label: 'My Journey',    icon: User },
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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom">
      <nav className="flex justify-around items-center h-16" aria-label="Main navigation">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              href={path}
              data-testid={`nav-${path.slice(1)}`}
              className="flex-1 flex flex-col items-center justify-center h-full gap-1 min-h-[44px] relative px-1"
              aria-current={active ? 'page' : undefined}
            >
              {active && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
              )}
              <Icon
                size={21}
                className={`transition-colors shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`}
                strokeWidth={active ? 2.5 : 1.8}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] font-medium tracking-tight transition-colors text-center leading-tight ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
