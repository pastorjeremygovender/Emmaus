/**
 * DevModeBanner — a visible, understated indicator shown on member-facing screens
 * when Development Mode is active.
 *
 * Only rendered for authorised admin accounts — never visible to normal members.
 * Provides a quick jump to "Preview Day" and a one-click disable.
 */

import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useLocation } from 'wouter';
import { useState, useCallback } from 'react';
import {
  isDevModeAuthorized,
  isDevelopmentMode,
  setDevModeEnabled,
} from '@/lib/dev-mode';
import { FlaskConical, ChevronDown, X } from 'lucide-react';

interface Props {
  /** When true the Preview Day picker is hidden (e.g. already inside the reader). */
  hidePicker?: boolean;
}

export function DevModeBanner({ hidePicker = false }: Props) {
  const { user } = useAuth();
  const { journeys, getStepsForJourney } = useJourney();
  const [, setLocation] = useLocation();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Track enabled state locally so the banner disappears immediately on disable
  // without requiring a navigation event.
  const [enabled, setEnabled] = useState(() => isDevelopmentMode(user));

  // Never render for normal members or when dev mode is off.
  if (!isDevModeAuthorized(user) || !enabled) return null;

  const handleDisable = () => {
    if (user) setDevModeEnabled(user.id, false);
    setEnabled(false);
    // Full reload so every component re-evaluates isDevelopmentMode from the
    // updated localStorage value without needing a React context for this flag.
    window.location.reload();
  };

  // Build the published day list for the picker.
  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );
  const publishedDays = coreJourney
    ? getStepsForJourney(coreJourney.id)
        .filter(s => s.status === 'Published')
        .sort((a, b) => a.day - b.day)
    : [];

  return (
    <div className="relative z-50 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-amber-800 select-none">
      <FlaskConical size={14} className="shrink-0 text-amber-600" />
      <span className="text-[12px] font-semibold tracking-wide uppercase">Development Mode</span>

      {!hidePicker && publishedDays.length > 0 && (
        <div className="relative ml-auto">
          <button
            onClick={() => setPickerOpen(o => !o)}
            className="flex items-center gap-1 text-[12px] font-medium px-2 py-1 rounded-md bg-amber-100 hover:bg-amber-200 transition-colors"
          >
            Preview Day
            <ChevronDown size={12} />
          </button>
          {pickerOpen && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-white rounded-xl border border-gray-200 shadow-lg w-64 max-h-72 overflow-y-auto py-1">
                {publishedDays.map(s => (
                  <button
                    key={s.day}
                    onClick={() => {
                      setPickerOpen(false);
                      setLocation(`/daily-rhythm/day/${s.day}` as `/${string}`);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">
                      Day {s.day} · Published
                    </div>
                    <div className="text-[13px] text-gray-900 truncate mt-0.5">{s.title}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={handleDisable}
        className="ml-auto shrink-0 p-1 rounded hover:bg-amber-200 transition-colors"
        title="Disable Development Mode"
        aria-label="Disable Development Mode"
      >
        <X size={13} />
      </button>
    </div>
  );
}
