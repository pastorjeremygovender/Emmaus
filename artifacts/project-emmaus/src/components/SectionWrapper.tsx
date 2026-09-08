import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

const SECTION_COLORS = {
  amber:   { bg: 'bg-amber-50/90 border-amber-200/60',    title: 'text-amber-700',   dot: 'bg-amber-500'   },
  violet:  { bg: 'bg-violet-50/90 border-violet-200/60',  title: 'text-violet-700',  dot: 'bg-violet-500'  },
  emerald: { bg: 'bg-emerald-50/90 border-emerald-200/60',title: 'text-emerald-700', dot: 'bg-emerald-500' },
  blue:    { bg: 'bg-blue-50/90 border-blue-200/60',      title: 'text-blue-700',    dot: 'bg-blue-500'    },
} as const;

export type SectionColor = keyof typeof SECTION_COLORS;

export function SectionWrapper({
  color,
  label,
  headerAction,
  children,
  className,
}: {
  color: SectionColor;
  label: string;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const c = SECTION_COLORS[color];
  return (
    <section className={cn('rounded-2xl border px-4 pt-3 pb-3.5 space-y-2', c.bg, className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} aria-hidden="true" />
          <h2 className={cn('text-[10px] font-bold uppercase tracking-[0.14em]', c.title)}>
            {label}
          </h2>
        </div>
        {headerAction}
      </div>
      {children}
    </section>
  );
}
