import React from 'react';
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
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border pb-safe">
      <nav className="flex justify-around items-center h-16">
        {navItems.map(({ path, label, icon: Icon }) => {
          const isActive = location === path;
          return (
            <Link key={path} href={path} className="flex-1 flex flex-col items-center justify-center h-full gap-1">
              <Icon 
                size={24} 
                className={`transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground'}`} 
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
