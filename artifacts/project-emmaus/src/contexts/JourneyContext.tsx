import React, { createContext, useContext, useState, useEffect } from 'react';
import { DEMO_JOURNEYS, DEMO_STEPS, DEMO_PROGRESS } from '../lib/demo-data';

export type Journey = {
  id: string;
  title: string;
  description: string;
  journeyType: string;
  durationDays: number;
  status: string;
  sermon?: any;
  // Admin metadata fields
  coverImageUrl?: string;
  churchWide?: boolean;
  startDate?: string;
  endDate?: string;
  linkedSermonId?: string;
  overloadExempt?: boolean;
  pastorEdited?: boolean;
  publishedAt?: string;
  updatedAt?: string;
};

export type Step = {
  journeyId: string;
  day: number;
  title: string;
  mentorIntro: string;
  scripture: string;
  devotional: string;
  reflectionQuestion: string;
  prayerPrompt: string;
  actionStep: string;
  sermonTimestampSeconds?: number;
  sermonLink?: string;
  sermonContextualSentence?: string;
  order?: number;
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
  getJourney: (id: string) => Journey | undefined;
  getStep: (journeyId: string, day: number) => Step | undefined;
  getStepsForJourney: (journeyId: string) => Step[];
  completeStep: (journeyId: string, day: number, reflectionText: string) => void;
  startJourney: (journeyId: string) => void;
  updateJourney: (journey: Journey) => void;
  addJourney: (journey: Journey) => void;
  deleteJourney: (journeyId: string) => void;
  updateStep: (step: Step) => void;
  addStep: (step: Step) => void;
  deleteStep: (journeyId: string, day: number) => void;
};

const JourneyContext = createContext<JourneyContextType | null>(null);

export function JourneyProvider({ children }: { children: React.ReactNode }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [reflections, setReflections] = useState<Record<string, string>>({});

  useEffect(() => {
    const sJourneys = localStorage.getItem('emmaus_journeys');
    setJourneys(sJourneys ? JSON.parse(sJourneys) : DEMO_JOURNEYS);
    if (!sJourneys) localStorage.setItem('emmaus_journeys', JSON.stringify(DEMO_JOURNEYS));

    const sSteps = localStorage.getItem('emmaus_steps');
    setSteps(sSteps ? JSON.parse(sSteps) : DEMO_STEPS);
    if (!sSteps) localStorage.setItem('emmaus_steps', JSON.stringify(DEMO_STEPS));

    const sProgress = localStorage.getItem('emmaus_progress');
    setProgress(sProgress ? JSON.parse(sProgress) : DEMO_PROGRESS);
    if (!sProgress) localStorage.setItem('emmaus_progress', JSON.stringify(DEMO_PROGRESS));

    const sReflections = localStorage.getItem('emmaus_reflections');
    if (sReflections) setReflections(JSON.parse(sReflections));
  }, []);

  const getJourney = (id: string) => journeys.find(j => j.id === id);
  const getStep = (journeyId: string, day: number) =>
    steps.find(s => s.journeyId === journeyId && s.day === day);
  const getStepsForJourney = (journeyId: string) =>
    steps.filter(s => s.journeyId === journeyId).sort((a, b) => a.day - b.day);

  const completeStep = (journeyId: string, day: number, reflectionText: string) => {
    const curProg = progress[journeyId] || {
      journeyId,
      currentDay: 1,
      completedDays: [],
      startedAt: new Date().toISOString(),
      lastCompletedAt: null,
    };
    const completedDays = [...new Set([...curProg.completedDays, day])];
    const newProg = {
      ...curProg,
      completedDays,
      currentDay: Math.max(curProg.currentDay, day + 1),
      lastCompletedAt: new Date().toISOString(),
    };
    const nextProgress = { ...progress, [journeyId]: newProg };
    setProgress(nextProgress);
    localStorage.setItem('emmaus_progress', JSON.stringify(nextProgress));

    if (reflectionText.trim()) {
      const key = `${journeyId}-${day}`;
      const nextRef = { ...reflections, [key]: reflectionText };
      setReflections(nextRef);
      localStorage.setItem('emmaus_reflections', JSON.stringify(nextRef));
    }
  };

  const startJourney = (journeyId: string) => {
    if (!progress[journeyId]) {
      const newProg = {
        journeyId,
        currentDay: 1,
        completedDays: [],
        startedAt: new Date().toISOString(),
        lastCompletedAt: null,
      };
      const nextProgress = { ...progress, [journeyId]: newProg };
      setProgress(nextProgress);
      localStorage.setItem('emmaus_progress', JSON.stringify(nextProgress));
    }
  };

  const _saveJourneys = (next: Journey[]) => {
    setJourneys(next);
    localStorage.setItem('emmaus_journeys', JSON.stringify(next));
  };

  const _saveSteps = (next: Step[]) => {
    setSteps(next);
    localStorage.setItem('emmaus_steps', JSON.stringify(next));
  };

  const updateJourney = (journey: Journey) =>
    _saveJourneys(journeys.map(j => (j.id === journey.id ? journey : j)));

  const addJourney = (journey: Journey) =>
    _saveJourneys([...journeys, { ...journey, updatedAt: new Date().toISOString() }]);

  const deleteJourney = (journeyId: string) => {
    _saveJourneys(journeys.filter(j => j.id !== journeyId));
    _saveSteps(steps.filter(s => s.journeyId !== journeyId));
  };

  const updateStep = (step: Step) =>
    _saveSteps(steps.map(s => (s.journeyId === step.journeyId && s.day === step.day ? step : s)));

  const addStep = (step: Step) => _saveSteps([...steps, step]);

  const deleteStep = (journeyId: string, day: number) =>
    _saveSteps(steps.filter(s => !(s.journeyId === journeyId && s.day === day)));

  return (
    <JourneyContext.Provider
      value={{
        journeys,
        steps,
        progress,
        reflections,
        getJourney,
        getStep,
        getStepsForJourney,
        completeStep,
        startJourney,
        updateJourney,
        addJourney,
        deleteJourney,
        updateStep,
        addStep,
        deleteStep,
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
