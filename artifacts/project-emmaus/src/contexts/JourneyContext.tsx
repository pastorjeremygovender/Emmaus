import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import * as api from '@/lib/journeys-api';
import { accountStorageKey } from '@/lib/account-storage';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Journey = {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  journeyType: string;
  category?: string;
  difficulty?: string;
  estimatedDuration?: string;
  tags?: string[];
  prerequisites?: string[];
  durationDays: number;
  status: string;
  // Legacy field — retained for backward compatibility with existing components
  sermon?: any;
  // Admin / metadata fields
  coverImageUrl?: string;
  churchWide?: boolean;
  startDate?: string;
  endDate?: string;
  linkedSermonId?: string;
  xpReward?: number;
  overloadExempt?: boolean;
  pastorEdited?: boolean;
  publishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  collectionId?: string;
  themeColor?: string;          // hex colour, e.g. '#3B82F6' — future branded Walk experiences
  version?: number;             // incremented on each publish; 1-based
  scriptureReference?: string;  // e.g. "John 3:16-17"
  nextJourneyId?: string;       // slug of recommended next journey after completion
  requiresDailyGate?: boolean;  // default true — set false to bypass daily gate for pastoral journeys
  /** Set when admin publishes with "Notify members" ON — drives NEW/UPDATED badges */
  notifyPublishedAt?: string;
  // AI Builder metadata
  aiGenerated?: boolean;
  sourcesSummary?: {
    scriptureReferences: string[];
    sermonsUsed: Array<{ title: string; date: string }>;
    generatedSections: string[];
  };
  introductionContent?: string; // journey-level intro text (stored in metadata JSONB)
  completionMessage?: string;   // short closing message after journey completion (stored in metadata JSONB)
  /**
   * Display label prefix for steps. null / undefined = auto-derive from journeyType:
   * 'daily-rhythm' → "Day", everything else → "Step".
   */
  stepLabelPrefix?: string | null;
};

export type Step = {
  journeyId: string;
  day: number;
  title: string;
  status: string;       // "Draft" | "Published"

  // Canonical discipleship fields
  mentorIntro: string;
  scripture: string;
  devotional: string;
  reflectionQuestion: string;
  prayerPrompt: string;
  actionStep: string;
  memoryVerse?: string;
  lookingAhead?: string; // Emmaus Journey Standard — short intro for tomorrow's journey

  // Emmaus Standard closing text (stored in content.closingText JSONB)
  closingText?: string;

  // Extended metadata
  preferredTranslation?: string;
  estimatedReadingTime?: number;
  xpReward?: number;

  // JSONB arrays
  scriptureReferences?: Array<{ reference: string; translation?: string; verseText?: string }>;
  suggestedSermons?: Array<{
    sermonId?: string;
    timestamp?: number;
    topic?: string;
    link?: string;
    contextualSentence?: string;
  }>;
  suggestedFollowUpQuestions?: string[];
  unlockConditions?: Record<string, unknown> | null;

  // Legacy sermon fields (backward compat)
  sermonTimestampSeconds?: number;
  sermonLink?: string;
  sermonContextualSentence?: string;
  order?: number;

  // Block-based content (Content Studio)
  blocks?: Array<Record<string, unknown>> | null;

  // Walk Completion entry — not a numbered lesson.
  // Excluded from lesson lists, progress counts, and durationDays.
  isCompletionStep?: boolean;
  /** Optional per-step display label (e.g. "1 January"). Overrides prefix+number when set. */
  displayLabel?: string | null;

  /** Share image — object-storage path shown as a "Take this with you" card at the bottom of the step. */
  shareImageUrl?: string | null;
};

export type Progress = {
  journeyId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  lastCompletedAt: string | null;
  /** Engagement lifecycle status — active | paused | completed | dropped */
  status?: string;
  /** Set when member opens the content — clears UPDATED badge */
  lastOpenedAt?: string | null;
  /** Non-destructive hide: card removed from Today's Steps, all progress preserved. */
  hiddenFromToday?: boolean;
  /** The member-facing surface that originally started this progress. */
  displayOrigin?: api.JourneyDisplayOrigin | null;
};

export type DailyRhythmState = api.DailyRhythmState;

type JourneyContextType = {
  journeys: Journey[];
  steps: Step[];
  progress: Record<string, Progress>;
  dailyRhythmState: DailyRhythmState | null;
  reflections: Record<string, string>;
  loading: boolean;
  getJourney: (id: string) => Journey | undefined;
  getStep: (journeyId: string, day: number) => Step | undefined;
  getStepsForJourney: (journeyId: string) => Step[];
  completeStep: (
    journeyId: string,
    day: number,
    reflectionText: string,
  ) => Promise<api.CompleteStepResponse>;
  startJourney: (journeyId: string, displayOrigin?: api.JourneyDisplayOrigin) => Promise<void>;
  // Admin mutations — return promises so callers can await and handle errors
  updateJourney: (journey: Journey) => Promise<Journey>;
  addJourney: (journey: Journey) => Promise<Journey>;
  deleteJourney: (journeyId: string) => Promise<void>;
  permanentDeleteJourney: (journeyId: string) => Promise<void>;
  duplicateJourney: (journeyId: string) => Promise<Journey>;
  // originalDay: the day number used to look up the existing row (before any renumbering)
  updateStep: (step: Step, originalDay?: number) => Promise<Step>;
  addStep: (step: Step) => Promise<Step>;
  deleteStep: (journeyId: string, day: number) => Promise<void>;
  refreshJourneys: () => Promise<void>;
  refreshSteps: (journeyId: string) => Promise<void>;
  // Development-mode test tools — affect the calling user's progress only
  resetProgress: (journeyId: string) => Promise<void>;
  markStepIncomplete: (journeyId: string, day: number) => Promise<void>;
};

const JourneyContext = createContext<JourneyContextType | null>(null);

export function JourneyProvider({ children }: { children: React.ReactNode }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [dailyRhythmState, setDailyRhythmState] = useState<DailyRhythmState | null>(null);
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const activeSubjectRef = useRef<string | null>(null);

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const subject = user?.id ?? null;
    activeSubjectRef.current = subject;

    // Never render one account's in-memory state while another account loads.
    setJourneys([]);
    setSteps([]);
    setProgress({});
    setDailyRhythmState(null);
    setReflections({});

    if (!subject) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function init() {
      setLoading(true);
      const bootstrapStartedAt = performance.now();
      const timings: Record<string, number> = {};
      const mark = (name: string, startedAt: number) => {
        timings[name] = Math.round(performance.now() - startedAt);
      };
      try {
        // Admins and super-admins get all journeys (any status); users get published only
        const catalogueStartedAt = performance.now();
        const jList = (user?.role === 'admin' || user?.role === 'superAdmin')
          ? await api.listJourneys()
          : await api.listPublishedJourneys();
        mark('catalogue', catalogueStartedAt);

        if (cancelled) return;
        setJourneys(jList);

        const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
        const dailyJourney = jList.find(j =>
          j.journeyType === 'daily-rhythm' || j.journeyType === 'core',
        );
        const loadSteps = async (journey: Journey): Promise<Step[]> => {
          try {
            return await api.listSteps(journey.id);
          } catch {
            return [];
          }
        };

        const progressStartedAt = performance.now();
        const progressPromise = api.getAllProgress().catch(() => null);
        const rhythmPromise = api.getDailyRhythmState().catch(stateError => {
          console.warn('[Daily Rhythm] canonical state unavailable; using progress snapshot', stateError);
          return null;
        });
        const dailyStepsPromise = dailyJourney ? loadSteps(dailyJourney) : Promise.resolve([]);
        const [prog, rhythm, dailySteps] = await Promise.all([
          progressPromise,
          rhythmPromise,
          dailyStepsPromise,
        ]);
        mark('progress-and-daily-step', progressStartedAt);

        if (cancelled || activeSubjectRef.current !== subject) return;
        const visibleDailySteps = isAdmin
          ? dailySteps
          : dailySteps.filter(s => s.status === 'Published');
        setSteps(visibleDailySteps);
        if (prog) setProgress(prog);
        if (rhythm) {
          setProgress(previous => ({ ...(prog ?? previous), [rhythm.journeyId]: rhythm.progress ?? previous[rhythm.journeyId] }));
          setDailyRhythmState(rhythm);
        }

        // A brand-new account gets a server-backed starting set across all
        // Today's Steps content systems. Refresh this map after seeding so the
        // Daily Rhythm and Journey cards are available without a page reload.
        if (user?.role === 'user') {
          try {
            const defaults = await api.initializeMemberHomeDefaults();
            if (defaults.seeded) {
              const seededProgress = await api.getAllProgress();
              if (!cancelled && activeSubjectRef.current === subject) {
                setProgress(seededProgress);
              }
            }
          } catch (error) {
            // Initial content is supplementary; a transient initializer failure
            // must not prevent the member from opening the app.
            console.warn('[MemberHome] default initialization unavailable', error);
          }
        }

        // The opening only needs the canonical journey and its current step.
        // Remaining journey steps load in parallel after the first useful screen
        // can render, instead of blocking every member on the full catalogue.
        const remainingJourneys = dailyJourney
          ? jList.filter(j => j.id !== dailyJourney.id)
          : jList;
        if (remainingJourneys.length > 0) {
          const loadRemaining = async () => {
            const remaining = await Promise.all(remainingJourneys.map(loadSteps));
            if (cancelled || activeSubjectRef.current !== subject) return;
            const visibleRemaining = (isAdmin ? remaining.flat() : remaining.flat().filter(s => s.status === 'Published'));
            setSteps(previous => [...previous, ...visibleRemaining]);
            console.debug('[JourneyBootstrap]', {
              phase: 'secondary-content-ready',
              durationMs: Math.round(performance.now() - bootstrapStartedAt),
              journeyCount: remainingJourneys.length,
            });
          };
          void loadRemaining();
        }

        if (subject) {
          const localRef = localStorage.getItem(accountStorageKey('emmaus_reflections', subject));
          if (localRef && !cancelled && activeSubjectRef.current === subject) {
            try {
              setReflections(JSON.parse(localRef));
            } catch {
              // ignore malformed local cache
            }
          }
        }
        console.debug('[JourneyBootstrap]', {
          phase: 'primary-content-ready',
          durationMs: Math.round(performance.now() - bootstrapStartedAt),
          timings,
          journeyCount: jList.length,
          primaryStepCount: visibleDailySteps.length,
        });
      } catch (err) {
        console.error('Failed to load journeys:', err);
      } finally {
        if (!cancelled && activeSubjectRef.current === subject) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

  // OpeningGate re-resolves the calendar on cold launch, notification tap, and
  // PWA resume. Refresh this shared snapshot so Walk and navigators do not keep
  // rendering the pre-resume day from the initial bootstrap.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const refresh = () => {
      void api.getDailyRhythmState().then(state => {
        if (cancelled || !state || activeSubjectRef.current !== user.id) return;
        setDailyRhythmState(state);
        if (state.progress) {
          setProgress(previous => ({ ...previous, [state.journeyId]: state.progress! }));
        }
      }).catch(() => {
        // OpeningGate remains the user-facing error boundary for startup.
      });
    };
    window.addEventListener('emmaus:daily-rhythm-resolved', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('emmaus:daily-rhythm-resolved', refresh);
    };
  }, [user?.id]);

  // ─── Getters ───────────────────────────────────────────────────────────────

  const getJourney = useCallback(
    (id: string) => journeys.find(j => j.id === id),
    [journeys]
  );

  const getStep = useCallback(
    (journeyId: string, day: number) =>
      steps.find(s => s.journeyId === journeyId && s.day === day),
    [steps]
  );

  const getStepsForJourney = useCallback(
    (journeyId: string) =>
      steps.filter(s => s.journeyId === journeyId).sort((a, b) => a.day - b.day),
    [steps]
  );

  // ─── User operations (fire-and-forget, optimistic) ─────────────────────────

  const startJourney = useCallback(
    async (
      journeyId: string,
      displayOrigin?: api.JourneyDisplayOrigin,
    ): Promise<void> => {
      if (!user?.id) throw new Error('Not signed in');
      const subject = user.id;
      const existing = progress[journeyId];
      // Starting an already-active journey is a no-op. Starting a paused or
      // completed journey is explicit re-engagement and must reach the server
      // so it becomes eligible for Today's Steps again.
      // An active row with an origin is already classified. Do not rewrite it
      // just because the member later opened the same Walk elsewhere.
      if (existing && existing.status === 'active' && existing.displayOrigin) return;
      if (existing) {
        setProgress(p => ({
          ...p,
          [journeyId]: { ...existing, status: 'active', hiddenFromToday: false },
        }));
        try {
          const prog = await api.startJourney(journeyId, displayOrigin);
          if (activeSubjectRef.current !== subject) return;
          setProgress(p => ({ ...p, [journeyId]: prog }));
        } catch (err) {
          if (activeSubjectRef.current === subject) {
            setProgress(p => ({ ...p, [journeyId]: existing }));
          }
          throw err;
        }
        return;
      }
      const optimistic: Progress = {
        journeyId,
        currentDay: 1,
        completedDays: [],
        startedAt: new Date().toISOString(),
        lastCompletedAt: null,
        displayOrigin: displayOrigin ?? null,
      };
      setProgress(p => ({ ...p, [journeyId]: optimistic }));
      try {
        const prog = await api.startJourney(journeyId, displayOrigin);
        if (activeSubjectRef.current !== subject) return;
        setProgress(p => ({ ...p, [journeyId]: prog }));
      } catch (err) {
        if (activeSubjectRef.current !== subject) return;
        // Roll back the optimistic update so the user can retry cleanly.
        setProgress(p => {
          const next = { ...p };
          delete next[journeyId];
          return next;
        });
        throw err;
      }
    },
    [user?.id, progress]
  );

  const completeStep = useCallback(
    async (
      journeyId: string,
      day: number,
      reflectionText: string,
    ): Promise<api.CompleteStepResponse> => {
      if (!user?.id) throw new Error('Not signed in');
      const subject = user.id;
      const previousProgress = progress[journeyId];

      const isDailyRhythm = journeys.find(j => j.id === journeyId)?.journeyType === 'daily-rhythm'
        || journeys.find(j => j.id === journeyId)?.journeyType === 'core';

      // Daily Rhythm never invents progression locally. Its completion state is
      // applied only from the authoritative server response below.
      if (!isDailyRhythm) {
        setProgress(p => {
          const existing = p[journeyId];
          if (!existing) return p;
          const completedDays = [...new Set([...existing.completedDays, day])];
          return {
            ...p,
            [journeyId]: {
              ...existing,
              completedDays,
              currentDay: Math.max(existing.currentDay, day + 1),
              lastCompletedAt: new Date().toISOString(),
            },
          };
        });
      }

      // Save reflection locally
      if (reflectionText.trim()) {
        const key = `${journeyId}-${day}`;
        setReflections(r => {
          const updated = { ...r, [key]: reflectionText };
          localStorage.setItem(
            accountStorageKey('emmaus_reflections', subject),
            JSON.stringify(updated),
          );
          return updated;
        });
      }

      try {
        const completion = await api.completeStep(journeyId, day, reflectionText);
        if (activeSubjectRef.current !== subject) return completion;
        const prog = completion.progress;
        if (!prog || prog.journeyId !== journeyId) {
          throw new Error('The server returned an invalid completion');
        }
        setProgress(p => ({ ...p, [journeyId]: prog }));
        if (isDailyRhythm) {
          if (activeSubjectRef.current === subject) {
            setDailyRhythmState(completion.dailyRhythmState ?? null);
            if (completion.dailyRhythmState?.progress) {
              setProgress(p => ({
                ...p,
                [completion.dailyRhythmState!.journeyId]: completion.dailyRhythmState!.progress!,
              }));
            }
          }
        }
        return completion;
      } catch (err) {
        console.error('[Emmaus] completeStep server sync failed:', err);
        if (activeSubjectRef.current === subject) {
          // The progress update above is optimistic for regular walks. Do not
          // let a failed progress/reflection write make the UI look complete;
          // restore the pre-submit snapshot so the member can retry.
          setProgress(p => {
            const next = { ...p };
            if (previousProgress) next[journeyId] = previousProgress;
            else delete next[journeyId];
            return next;
          });
        }
        throw err;
      }
    },
    [user?.id, journeys, progress]
  );

  // ─── Admin mutations — await API, then update local state ──────────────────

  const addJourney = useCallback(
    async (journey: Journey): Promise<Journey> => {
      const created = await api.createJourney(journey, user?.id);
      setJourneys(js => [...js, created]);
      return created;
    },
    [user?.id]
  );

  const updateJourney = useCallback(
    async (journey: Journey): Promise<Journey> => {
      const updated = await api.updateJourney(journey.id, journey, user?.id);
      setJourneys(js => js.map(j => j.id === updated.id ? updated : j));
      return updated;
    },
    [user?.id]
  );

  const deleteJourney = useCallback(
    async (journeyId: string): Promise<void> => {
      await api.deleteJourney(journeyId, user?.id);
      setJourneys(js => js.filter(j => j.id !== journeyId));
      setSteps(ss => ss.filter(s => s.journeyId !== journeyId));
    },
    [user?.id]
  );

  const permanentDeleteJourney = useCallback(
    async (journeyId: string): Promise<void> => {
      await api.permanentDeleteJourney(journeyId, user?.id, user?.email);
      setJourneys(js => js.filter(j => j.id !== journeyId));
      setSteps(ss => ss.filter(s => s.journeyId !== journeyId));
    },
    [user?.id, user?.email]
  );

  const duplicateJourney = useCallback(
    async (journeyId: string): Promise<Journey> => {
      const copy = await api.duplicateJourney(journeyId, user?.id);
      setJourneys(js => [...js, copy]);
      // Fetch steps for the new copy
      try {
        const copySteps = await api.listSteps(copy.id);
        setSteps(ss => [...ss, ...copySteps]);
      } catch { /* ignore */ }
      return copy;
    },
    [user?.id]
  );

  const addStep = useCallback(
    async (step: Step): Promise<Step> => {
      const created = await api.createStep(step.journeyId, step, user?.id);
      setSteps(ss => [...ss.filter(s => !(s.journeyId === created.journeyId && s.day === created.day)), created]);
      // Refresh journey to get updated durationDays
      try {
        const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
        const jList = isAdmin ? await api.listJourneys() : await api.listPublishedJourneys();
        setJourneys(jList);
      } catch { /* ignore */ }
      return created;
    },
    [user?.id, user?.role]
  );

  const updateStep = useCallback(
    async (step: Step, originalDay?: number): Promise<Step> => {
      // Use originalDay to target the correct row when the user renumbers a step
      const targetDay = originalDay ?? step.day;
      const updated = await api.updateStep(step.journeyId, targetDay, step, user?.id);
      setSteps(ss => ss.map(s =>
        s.journeyId === updated.journeyId && s.day === (originalDay ?? updated.day) ? updated : s
      ));
      return updated;
    },
    [user?.id]
  );

  const deleteStep = useCallback(
    async (journeyId: string, day: number): Promise<void> => {
      await api.deleteStep(journeyId, day, user?.id);
      setSteps(ss => ss.filter(s => !(s.journeyId === journeyId && s.day === day)));
      try {
        const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
        const jList = isAdmin ? await api.listJourneys() : await api.listPublishedJourneys();
        setJourneys(jList);
      } catch { /* ignore */ }
    },
    [user?.id, user?.role]
  );

  // ─── Development-mode test tools ──────────────────────────────────────────
  // These affect only the current user's own progress row.

  const resetProgress = useCallback(
    async (journeyId: string): Promise<void> => {
      if (!user?.id) return;
      const subject = user.id;
      const prog = await api.resetProgress(journeyId);
      if (activeSubjectRef.current !== subject) return;
      setProgress(p => ({ ...p, [journeyId]: prog }));
    },
    [user?.id]
  );

  const markStepIncomplete = useCallback(
    async (journeyId: string, day: number): Promise<void> => {
      if (!user?.id) return;
      const subject = user.id;
      const prog = await api.markStepIncomplete(journeyId, day);
      if (activeSubjectRef.current !== subject) return;
      setProgress(p => ({ ...p, [journeyId]: prog }));
    },
    [user?.id]
  );

  // ─── Refresh helpers ───────────────────────────────────────────────────────

  const refreshJourneys = useCallback(async () => {
    const subject = user?.id ?? null;
    if (!subject) return;
    try {
      const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
      const jList = isAdmin
        ? await api.listJourneys()
        : await api.listPublishedJourneys();
      if (activeSubjectRef.current !== subject) return;
      setJourneys(jList);
    } catch {
      // ignore
    }
  }, [user?.id, user?.role]);

  const refreshSteps = useCallback(async (journeyId: string) => {
    const subject = user?.id ?? null;
    if (!subject) return;
    try {
      const jSteps = await api.listSteps(journeyId);
      const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
      const visible = isAdmin ? jSteps : jSteps.filter(s => s.status === 'Published');
      if (activeSubjectRef.current !== subject) return;
      setSteps(s => [...s.filter(x => x.journeyId !== journeyId), ...visible]);
    } catch {
      // ignore
    }
  }, [user?.id, user?.role]);

  const ownsVisibleState = Boolean(user?.id && activeSubjectRef.current === user.id);
  const visibleLoading = user?.id ? loading || !ownsVisibleState : false;

  return (
    <JourneyContext.Provider
      value={{
        journeys: ownsVisibleState ? journeys : [],
        steps: ownsVisibleState ? steps : [],
        progress: ownsVisibleState ? progress : {},
        dailyRhythmState: ownsVisibleState ? dailyRhythmState : null,
        reflections: ownsVisibleState ? reflections : {},
        loading: visibleLoading,
        getJourney: ownsVisibleState ? getJourney : () => undefined,
        getStep: ownsVisibleState ? getStep : () => undefined,
        getStepsForJourney: ownsVisibleState ? getStepsForJourney : () => [],
        completeStep,
        startJourney,
        updateJourney,
        addJourney,
        deleteJourney,
        permanentDeleteJourney,
        duplicateJourney,
        updateStep,
        addStep,
        deleteStep,
        refreshJourneys,
        refreshSteps,
        resetProgress,
        markStepIncomplete,
      }}
    >
      {children}
    </JourneyContext.Provider>
  );
}

export const useJourney = () => {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used within JourneyProvider');
  return ctx;
};
