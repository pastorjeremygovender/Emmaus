/**
 * MemoryConsentBar — gentle inline prompt for user-approved memory storage.
 *
 * Rules:
 * - Appears once after a response includes a memory-worthy insight
 * - Two options only: "Yes, remember this" and "Not now"
 * - Never stores automatically — only on explicit "Yes"
 * - Shows a brief "Remembered ✓" confirmation before dismissing
 * - Disappears after either choice
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface MemoryConsentBarProps {
  memoryContent: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function MemoryConsentBar({ memoryContent, onAccept, onDecline }: MemoryConsentBarProps) {
  const [confirmed, setConfirmed] = useState(false);

  function handleAccept() {
    setConfirmed(true);
    // Brief confirmation before the parent removes the bar
    setTimeout(() => {
      onAccept();
    }, 1200);
  }

  return (
    <div
      role="dialog"
      aria-label="Save this to your memories?"
      className="rounded-xl border border-border bg-muted/40 p-4 space-y-3"
    >
      {confirmed ? (
        <p className="text-[14px] text-foreground font-medium text-center py-1">
          Remembered ✓
        </p>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Remember this?
            </p>
            <p className="text-[14px] text-foreground leading-relaxed">
              "{memoryContent}"
            </p>
          </div>
          <div className="flex gap-2.5">
            <Button
              size="sm"
              className="flex-1 h-9 text-[13px] rounded-lg"
              onClick={handleAccept}
            >
              Yes, remember this
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1 h-9 text-[13px] rounded-lg text-muted-foreground"
              onClick={onDecline}
            >
              Not now
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
