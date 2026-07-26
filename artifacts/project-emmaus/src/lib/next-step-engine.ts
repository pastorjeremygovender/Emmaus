/**
 * Next-step engine — deterministic, priority-ordered recommendation.
 *
 * Priority order (spec §NEXT-STEP ENGINE):
 *   1. Today's unfinished 15 Minutes with Jesus (core journey)
 *   2. This Week's Sermon companion if active and not completed today
 *   3. Next unfinished step in the user's most recently continued active growth Journey
 *   4. A newly assigned church-wide Journey (churchWide = true)
 *   5. Another active growth Journey not recently continued
 *   6. Browse recommendation (user has capacity for a new Journey)
 *
 * The engine is deterministic: given the same inputs it always returns the same result.
 * It never uses AI or randomness for the primary recommendation.
 */

import type { Journey, Progress } from '@/contexts/JourneyContext';
import type { EnrollmentMap } from './enrollment';
import { isExemptJourney } from './enrollment';
import { isCompletedToday } from './daily-lock';

export type NextStepType =
  | 'core'
  | 'companion'
  | 'growth'
  | 'church-wide'
  | 'browse';

export interface NextStep {
  type: NextStepType;
  journey: Journey;
  day: number;
  label: string;         // e.g. "15 Minutes with Jesus"
  title: string;         // step or journey title
  description: string;   // warm supporting copy
  buttonText: string;    // e.g. "Begin", "Continue"
  estimatedTime?: string;
  progressPercent?: number; // 0–100 for progress indicator
  completedToday?: boolean;
}

export interface NextStepEngineResult {
  primary: NextStep | null;
}

/** Returns progress-based completion percentage (0–100). */
function pct(prog: Progress, journey: Journey): number {
  const total = journey.durationDays || 1;
  return Math.round((prog.completedDays.length / total) * 100);
}

/** Most recently continued journey: highest lastCompletedAt timestamp. */
function mostRecentlyContinued(
  journeys: Journey[],
  progress: Record<string, Progress>
): Journey | undefined {
  return journeys
    .filter(j => progress[j.id]?.lastCompletedAt)
    .sort((a, b) => {
      const aDate = progress[a.id]?.lastCompletedAt ?? '';
      const bDate = progress[b.id]?.lastCompletedAt ?? '';
      return bDate.localeCompare(aDate);
    })[0];
}

export function computeNextStep(
  journeys: Journey[],
  progress: Record<string, Progress>,
  enrollment: EnrollmentMap
): NextStepEngineResult {
  const publishedJourneys = journeys.filter(j => j.status === 'Published');

  // ── Priority 1: Daily Rhythm (15 Minutes with Jesus) ─────────────────────
  // Accepts both 'daily-rhythm' (new) and 'core' (legacy) for backward compat.
  const coreJourney = publishedJourneys.find(
    j => j.journeyType === 'daily-rhythm' || j.journeyType === 'core'
  );
  if (coreJourney) {
    const prog = progress[coreJourney.id];
    const completedToday = isCompletedToday(prog?.lastCompletedAt);

    if (!prog) {
      // Not started — prompt to begin
      return {
        primary: {
          type: 'core',
          journey: coreJourney,
          day: 1,
          label: '15 Minutes with Jesus',
          title: 'Day 1 — Begin your walk',
          description: 'Start your daily time with Jesus. A simple, steady rhythm.',
          buttonText: 'Begin',
          estimatedTime: '15 min',
          progressPercent: 0,
          completedToday: false,
        },
      };
    }

    if (!completedToday) {
      const day = prog.currentDay;
      return {
        primary: {
          type: 'core',
          journey: coreJourney,
          day,
          label: '15 Minutes with Jesus',
          title: `Day ${day}`,
          description: prog.completedDays.length > 0
            ? "Continue where you left off. Today's time with Jesus is ready."
            : 'Your daily time with Jesus is ready.',
          buttonText: prog.completedDays.length > 0 ? 'Continue' : 'Begin',
          estimatedTime: coreJourney.estimatedDuration ?? '15 min',
          progressPercent: pct(prog, coreJourney),
          completedToday: false,
        },
      };
    }
    // Core is done today — fall through to next priority
  }

  // ── Priority 2: Companion (This Week's Sermon) ────────────────────────────
  const companionJourney = publishedJourneys.find(j => j.journeyType === 'companion');
  if (companionJourney && (enrollment[companionJourney.id] ?? 'active') === 'active') {
    const prog = progress[companionJourney.id];
    const completedToday = isCompletedToday(prog?.lastCompletedAt);
    if (!completedToday) {
      const day = prog?.currentDay ?? 1;
      return {
        primary: {
          type: 'companion',
          journey: companionJourney,
          day,
          label: "This Week's Sermon",
          title: companionJourney.sermon?.title ?? companionJourney.title,
          description: prog
            ? "Pick up where you stopped in this week's message."
            : "This week's sermon companion is ready for you.",
          buttonText: prog ? 'Continue' : 'Start Monday',
          estimatedTime: '10 min',
          progressPercent: prog ? pct(prog, companionJourney) : 0,
          completedToday: false,
        },
      };
    }
  }

  // ── Priority 3 & 4: Active growth journeys ────────────────────────────────
  const activeGrowthJourneys = publishedJourneys.filter(
    j =>
      !isExemptJourney(j) &&
      progress[j.id] && // user has started it
      (enrollment[j.id] ?? 'active') === 'active'
  );

  // Most recently continued first
  const recent = mostRecentlyContinued(activeGrowthJourneys, progress);
  if (recent) {
    const prog = progress[recent.id]!;
    const day = prog.currentDay;
    return {
      primary: {
        type: 'growth',
        journey: recent,
        day,
        label: 'Journey',
        title: recent.title,
        description: `Your next step in ${recent.title} is ready.`,
        buttonText: 'Continue',
        estimatedTime: recent.estimatedDuration,
        progressPercent: pct(prog, recent),
        completedToday: false,
      },
    };
  }

  // Church-wide assigned Journey not yet started
  const churchWide = publishedJourneys.find(
    j =>
      !isExemptJourney(j) &&
      j.churchWide === true &&
      !progress[j.id] &&
      (enrollment[j.id] ?? 'active') !== 'paused'
  );
  if (churchWide) {
    return {
      primary: {
        type: 'church-wide',
        journey: churchWide,
        day: 1,
        label: 'Church Journey',
        title: churchWide.title,
        description: `Your church is walking through ${churchWide.title} together. Join in.`,
        buttonText: 'Begin',
        estimatedTime: churchWide.estimatedDuration,
        progressPercent: 0,
        completedToday: false,
      },
    };
  }

  // ── Priority 5: Browse recommendation ─────────────────────────────────────
  const availableNew = publishedJourneys.find(
    j =>
      !isExemptJourney(j) &&
      !progress[j.id] &&
      (enrollment[j.id] ?? 'active') !== 'saved' &&
      (enrollment[j.id] ?? 'active') !== 'paused'
  );
  if (availableNew && activeGrowthJourneys.length < 2) {
    return {
      primary: {
        type: 'browse',
        journey: availableNew,
        day: 1,
        label: 'Suggested Journey',
        title: availableNew.title,
        description: availableNew.description ?? 'A journey picked for where you are.',
        buttonText: 'Preview',
        estimatedTime: availableNew.estimatedDuration,
        progressPercent: 0,
        completedToday: false,
      },
    };
  }

  return { primary: null };
}
