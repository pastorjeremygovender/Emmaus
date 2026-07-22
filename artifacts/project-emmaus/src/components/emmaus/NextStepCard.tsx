/**
 * NextStepCard — the primary one-action card shown once per Emmaus response.
 * Renders the action description and a single call-to-action button.
 */

import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLocation } from 'wouter';
import type { NextStep } from '@/lib/emmaus-client';

interface NextStepCardProps {
  nextStep: NextStep;
}

export function NextStepCard({ nextStep }: NextStepCardProps) {
  const [, setLocation] = useLocation();

  function handleAction() {
    if (nextStep.path.startsWith('http')) {
      window.open(nextStep.path, '_blank', 'noopener noreferrer');
    } else {
      setLocation(nextStep.path);
    }
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
        <Button
          className="w-full h-11 rounded-xl text-[15px] gap-1"
          onClick={handleAction}
        >
          {nextStep.primaryButtonText}
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </CardContent>
    </Card>
  );
}
