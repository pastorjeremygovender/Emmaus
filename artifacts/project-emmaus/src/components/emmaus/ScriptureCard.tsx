/**
 * ScriptureCard — displays a Bible reference surfaced by Emmaus.
 * Shows the reference, an optional display text, and an "Open in Bible" link
 * that navigates into the existing Bible reader at the correct chapter.
 * If the book is not available in the current provider, shows a calm inline
 * message instead of navigating to a broken view.
 */

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocation } from 'wouter';
import type { ScriptureRef } from '@/lib/emmaus-client';
import { formatScriptureReference, parseScriptureRef } from '@/lib/scripture-ref';

interface ScriptureCardProps {
  scripture: ScriptureRef;
}

export function ScriptureCard({ scripture }: ScriptureCardProps) {
  const [, setLocation] = useLocation();
  const [unavailable, setUnavailable] = useState(false);

  function handleOpen() {
    const parsed = parseScriptureRef(scripture.reference) ??
      parseScriptureRef(`${scripture.book} ${scripture.chapter}`);
    if (!parsed) {
      setUnavailable(true);
      return;
    }
    const startVerse = scripture.verseStart ?? parsed.startVerse;
    const endVerse = scripture.verseEnd ?? parsed.endVerse;
    const verse = startVerse
      ? `?startVerse=${startVerse}${endVerse && endVerse >= startVerse ? `&endVerse=${endVerse}` : ''}`
      : '';
    setLocation(`/bible/read/${parsed.bookId}/${parsed.chapter}${verse}`);
  }

  const displayReference = formatScriptureReference(scripture);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="p-4 flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5"
          aria-hidden="true"
        >
          <BookOpen size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1">
            Scripture
          </p>
          <p className="text-[16px] font-sans font-medium text-foreground break-words">
            {displayReference}
          </p>
          {scripture.displayText && (
            <p className="text-[14px] text-muted-foreground mt-1 leading-relaxed break-words">
              {scripture.displayText}
            </p>
          )}
          {unavailable ? (
            <p className="mt-2 text-[13px] text-muted-foreground italic">
              This passage could not be opened just now.
            </p>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 -ml-2 h-8 text-primary text-[13px] font-medium hover:bg-primary/10 px-2"
              onClick={handleOpen}
            >
              Open in Bible
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
