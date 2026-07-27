import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import * as api from '@/lib/journeys-api';

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
  scriptureReference?: string;  // e.g. "John 3:16-17"
  nextJourneyId?: string;       // slug of recommended next journey after completion
  requiresDailyGate?: boolean;  // default true — set false to bypass daily gate for pastoral journeys
  // AI Builder metadata
  aiGenerated?: boolean;
  sourcesSummary?: {
    scriptureReferences: string[];
    sermonsUsed: Array<{ title: string; date: string }>;
    generatedSections: string[];
  };
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
};

export type Progress = {
  journeyId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  lastCompletedAt: string | null;
};

type JourneyContextType = {
  journeys: Journey[];
  steps: Step[];
  progress: Record<string, Progress>;
  reflections: Record<string, string>;
  loading: boolean;
  getJourney: (id: string) => Journey | undefined;
  getStep: (journeyId: string, day: number) => Step | undefined;
  getStepsForJourney: (journeyId: string) => Step[];
  completeStep: (journeyId: string, day: number, reflectionText: string) => void;
  startJourney: (journeyId: string) => void;
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
};

const JourneyContext = createContext<JourneyContextType | null>(null);

export function JourneyProvider({ children }: { children: React.ReactNode }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [reflections, setReflections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // ─── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        // Admins and super-admins get all journeys (any status); users get published only
        const jList = (user?.role === 'admin' || user?.role === 'superAdmin')
          ? await api.listJourneys()
          : await api.listPublishedJourneys();

        if (cancelled) return;
        setJourneys(jList);

        // Fetch steps for all journeys
        const allSteps: Step[] = [];
        for (const j of jList) {
          try {
            const jSteps = await api.listSteps(j.id);
            allSteps.push(...jSteps);
          } catch {
            // ignore per-journey step errors
          }
        }
        if (cancelled) return;
        // Admins and super-admins see all steps (Draft + Published).
        // Members only receive Published steps — Draft steps must never appear to members.
        const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
        setSteps(isAdmin ? allSteps : allSteps.filter(s => s.status === 'Published'));

        // Fetch progress for logged-in users
        if (user?.id) {
          // One-time migration from localStorage
          const localProg = localStorage.getItem('emmaus_progress');
          if (localProg) {
            try {
              await api.importLocalProgress(user.id, JSON.parse(localProg));
              localStorage.removeItem('emmaus_progress');
            } catch {
              // keep in localStorage so it can be retried
            }
          }

          try {
            const prog = await api.getAllProgress(user.id);
            if (!cancelled) setProgress(prog);
          } catch {
            // ignore progress fetch errors
          }

          // Load reflections from localStorage (local cache)
          const localRef = localStorage.getItem('emmaus_reflections');
          if (localRef && !cancelled) {
            try {
              setReflections(JSON.parse(localRef));
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        console.error('Failed to load journeys:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
  }, [user?.id, user?.role]);

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
    (journeyId: string) => {
      if (!user?.id || progress[journeyId]) return;
      const optimistic: Progress = {
        journeyId,
        currentDay: 1,
        completedDays: [],
        startedAt: new Date().toISOString(),
        lastCompletedAt: null,
      };
      setProgress(p => ({ ...p, [journeyId]: optimistic }));
      api.startJourney(journeyId, user.id)
        .then(prog => setProgress(p => ({ ...p, [journeyId]: prog })))
        .catch(() => { /* ignore */ });
    },
    [user?.id, progress]
  );

  const completeStep = useCallback(
    (journeyId: string, day: number, reflectionText: string) => {
      if (!user?.id) return;

      // Optimistic update
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

      // Save reflection locally
      if (reflectionText.trim()) {
        const key = `${journeyId}-${day}`;
        setReflections(r => {
          const updated = { ...r, [key]: reflectionText };
          localStorage.setItem('emmaus_reflections', JSON.stringify(updated));
          return updated;
        });
      }

      // Sync to API
      api.completeStep(journeyId, user.id, day, reflectionText)
        .then(prog => setProgress(p => ({ ...p, [journeyId]: prog })))
        .catch(() => { /* ignore */ });
    },
    [user?.id]
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
        const jList = user?.role === 'admin' ? await api.listJourneys() : await api.listPublishedJourneys();
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
        const jList = user?.role === 'admin' ? await api.listJourneys() : await api.listPublishedJourneys();
        setJourneys(jList);
      } catch { /* ignore */ }
    },
    [user?.id, user?.role]
  );

  // ─── Refresh helpers ───────────────────────────────────────────────────────

  const refreshJourneys = useCallback(async () => {
    try {
      const jList = user?.role === 'admin'
        ? await api.listJourneys()
        : await api.listPublishedJourneys();
      setJourneys(jList);
    } catch {
      // ignore
    }
  }, [user?.role]);

  const refreshSteps = useCallback(async (journeyId: string) => {
    try {
      const jSteps = await api.listSteps(journeyId);
      // Apply the same Published-only filter for members as the initial load does.
      const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
      const visible = isAdmin ? jSteps : jSteps.filter(s => s.status === 'Published');
      setSteps(s => [...s.filter(x => x.journeyId !== journeyId), ...visible]);
    } catch {
      // ignore
    }
  }, [user?.role]);

  return (
    <JourneyContext.Provider
      value={{
        journeys,
        steps,
        progress,
        reflections,
        loading,
        getJourney,
        getStep,
        getStepsForJourney,
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
