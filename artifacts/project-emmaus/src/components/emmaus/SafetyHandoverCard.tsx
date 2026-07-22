/**
 * SafetyHandoverCard — shown fullscreen when the crisis safety layer triggers.
 *
 * Design rules:
 * - No theological preamble
 * - Clear, readable, calm tone
 * - Emergency support numbers prominently displayed
 * - "Return when you are ready" link — no pressure
 * - No streaming, no conversation UI visible behind this
 */

import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SafetyHandoverCardProps {
  onReturn: () => void;
}

export function SafetyHandoverCard({ onReturn }: SafetyHandoverCardProps) {
  return (
    <div
      role="region"
      aria-label="Safety information"
      className="min-h-[100dvh] bg-background flex flex-col"
    >
      <div className="flex-1 flex flex-col justify-center px-5 max-w-[480px] mx-auto w-full py-12 space-y-8">

        {/* Header */}
        <div className="space-y-3">
          <div
            className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-600 flex items-center justify-center"
            aria-hidden="true"
          >
            <Phone size={19} />
          </div>
          <h1 className="text-[24px] font-serif font-medium text-foreground leading-tight">
            You don't have to face this alone.
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            It sounds like you may be going through something serious. Before anything else,
            please reach out to someone who can be with you right now.
          </p>
        </div>

        {/* Crisis lines */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Talk to someone now
          </p>

          <a
            href="tel:116123"
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
            aria-label="Call Samaritans on 116 123"
          >
            <div
              className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Phone size={17} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-foreground">Samaritans</p>
              <p className="text-[13px] text-muted-foreground">116 123 · Free · 24/7</p>
            </div>
          </a>

          <a
            href="tel:999"
            className="flex items-center gap-3 p-4 rounded-xl border border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50 transition-all"
            aria-label="Call emergency services on 999"
          >
            <div
              className="w-9 h-9 rounded-lg bg-rose-500/20 text-rose-600 flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <Phone size={17} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-foreground">Emergency Services</p>
              <p className="text-[13px] text-muted-foreground">999 · If you are in immediate danger</p>
            </div>
          </a>

          <a
            href="sms:85258"
            className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
            aria-label="Text SHOUT on 85258"
          >
            <div
              className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[14px] font-bold"
              aria-hidden="true"
            >
              SMS
            </div>
            <div>
              <p className="text-[15px] font-semibold text-foreground">Shout Crisis Text Line</p>
              <p className="text-[13px] text-muted-foreground">Text SHOUT to 85258 · 24/7</p>
            </div>
          </a>
        </div>

        {/* Pastoral note */}
        <p className="text-[14px] text-muted-foreground leading-relaxed border-l-2 border-border pl-4">
          Emmaus cares about you deeply, and will be here when you're ready to continue.
          Please speak to someone who can be with you first.
        </p>

        {/* Return link */}
        <Button
          variant="ghost"
          className="w-full h-11 text-muted-foreground text-[15px] hover:text-foreground"
          onClick={onReturn}
        >
          Return when you are ready
        </Button>

      </div>
    </div>
  );
}
