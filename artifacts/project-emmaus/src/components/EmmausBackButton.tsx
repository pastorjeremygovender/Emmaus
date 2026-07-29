/**
 * EmmausBackButton — shared source-aware back navigation component.
 *
 * Platform standard: use this on every member-facing content page instead of
 * individual inline back buttons. It resolves its destination from ?source= and
 * ?sourceId= URL params, falls back to the content-specific `fallback` route
 * when no source is present (e.g. deep links), and prevents double-activation.
 *
 * Usage:
 *   const source   = new URLSearchParams(window.location.search).get('source');
 *   const sourceId = new URLSearchParams(window.location.search).get('sourceId');
 *   <EmmausBackButton source={source} sourceId={sourceId} fallback="/journeys?tab=journeys" />
 *
 * The back destination is resolved via resolveReturn() from lib/return-context.ts.
 */

import React, { useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { resolveReturn } from '@/lib/return-context';

export interface EmmausBackButtonProps {
  /** Value of ?source= URL param on the current page. */
  source?: string | null;
  /** Value of ?sourceId= URL param (required for 'journeyDetail' source). */
  sourceId?: string | null;
  /**
   * Content-specific safe fallback route when source is absent or unrecognised.
   * Choose the most appropriate parent for the content type:
   *   Daily Rhythm  → '/walk'
   *   Devotional    → '/journeys?tab=devotionals'
   *   Journey Day   → '/journeys?tab=journeys'
   *   Sermon Comp.  → '/journeys?tab=sermons'
   *   Bible passage → '/bible'
   */
  fallback: string;
  /** Override the aria-label. Defaults to "Back to {resolvedLabel}". */
  label?: string;
  /** Extra CSS classes added to the button wrapper. */
  className?: string;
}

export function EmmausBackButton({
  source,
  sourceId,
  fallback,
  label,
  className = '',
}: EmmausBackButtonProps) {
  const [, setLocation] = useLocation();
  // Prevent double-activation on rapid taps.
  const firedRef = useRef(false);

  const { path, label: resolvedLabel } = resolveReturn(source, sourceId, fallback);

  const handleClick = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    setLocation(path);
    // Reset so the button works again if SPA navigation doesn't unmount it.
    setTimeout(() => { firedRef.current = false; }, 500);
  };

  return (
    <button
      onClick={handleClick}
      className={`p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center ${className}`}
      aria-label={label ?? `Back to ${resolvedLabel}`}
    >
      <ArrowLeft size={22} />
    </button>
  );
}
