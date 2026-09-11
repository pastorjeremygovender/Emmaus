import { useLocation } from 'wouter';
import { Footprints, BookOpen } from 'lucide-react';

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const inBible = location === '/bible' || location.startsWith('/bible/');
  const destination = inBible
    ? { path: '/walk', label: "Today's Steps", icon: Footprints }
    : { path: '/bible', label: 'My Bible', icon: BookOpen };
  const Icon = destination.icon;

  return (
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-50 flex justify-center bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-5">
      <a
        href={`${base}${destination.path}`}
        onClick={event => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setLocation(destination.path);
        }}
        data-testid={`nav-${destination.path.slice(1)}`}
        className="pointer-events-auto flex min-h-[52px] w-[min(15rem,75vw)] items-center justify-center gap-2 rounded-full border border-primary/35 bg-background/95 px-6 text-[15px] font-semibold text-primary shadow-sm backdrop-blur"
        aria-label={destination.label}
      >
        <Icon size={20} strokeWidth={2} aria-hidden="true" />
        <span>{destination.label}</span>
      </a>
    </div>
  );
}
