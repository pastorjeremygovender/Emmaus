import { Link, useLocation } from 'wouter';
import { Compass, BookHeart, Map, User } from 'lucide-react';

export function BottomNav() {
  const [location] = useLocation();

  const navItems = [
    { path: '/walk', label: 'Walk', icon: Compass },
    { path: '/bible', label: 'Bible', icon: BookHeart },
    { path: '/journeys', label: 'Journeys', icon: Map },
    { path: '/personal', label: 'Personal', icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-area-bottom">
      <nav className="flex justify-around items-center h-16" aria-label="Main navigation">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location === path;
          return (
            <Link
              key={path}
              href={path}
              data-testid={`nav-${label.toLowerCase()}`}
              className="flex-1 flex flex-col items-center justify-center h-full gap-1 min-h-[44px] relative"
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
              )}
              <Icon
                size={22}
                className={`transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                strokeWidth={isActive ? 2.5 : 1.8}
                aria-hidden="true"
              />
              <span
                className={`text-xs font-medium tracking-tight transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
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
