/**
 * NextStepCard — the primary one-action card shown once per Emmaus response.
 * Renders the action description and a single call-to-action button.
 * If the path targets a Bible book not available in the current provider,
 * shows a calm inline message instead of navigating to a broken view.
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocation } from 'wouter';
import type { NextStep } from '@/lib/emmaus-client';
import { bibleProvider } from '@/lib/bible-provider';

interface NextStepCardProps {
  nextStep: NextStep;
}

/** Extract bookId from a /bible/read/:bookId/:chapter path, or null if not a Bible path. */
function bibleBookFromPath(path: string): string | null {
  const match = path.match(/^\/bible\/read\/([^/]+)/);
  return match ? match[1] : null;
}

export function NextStepCard({ nextStep }: NextStepCardProps) {
  const [, setLocation] = useLocation();
  const [unavailable, setUnavailable] = useState(false);

  function handleAction() {
    if (nextStep.path.startsWith('http')) {
      window.open(nextStep.path, '_blank', 'noopener noreferrer');
      return;
    }
    const bookId = bibleBookFromPath(nextStep.path);
    if (bookId !== null && !bibleProvider.supportsBook(bookId)) {
      setUnavailable(true);
      return;
    }
    setLocation(nextStep.path);
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          One next step
        </p>
        <p className="text-[15px] text-foreground leading-relaxed">
          {nextStep.action}
        </p>
        {unavailable ? (
          <p className="text-[13px] text-muted-foreground italic">
            This passage could not be opened just now.
          </p>
        ) : (
          <Button
            className="w-full h-11 rounded-xl text-[15px] gap-1"
            onClick={handleAction}
          >
            {nextStep.primaryButtonText}
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
