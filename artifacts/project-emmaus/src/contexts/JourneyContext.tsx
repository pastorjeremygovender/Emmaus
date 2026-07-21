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
  progress: Record<string, Progress>;
  getJourney: (id: string) => Journey | undefined;
  getStep: (journeyId: string, day: number) => Step | undefined;
  completeStep: (journeyId: string, day: number, reflectionText: string) => void;
  startJourney: (journeyId: string) => void;
  updateJourney: (journey: Journey) => void;
  updateStep: (step: Step) => void;
  reflections: Record<string, string>; // stepKey -> text
};

const JourneyContext = createContext<JourneyContextType | null>(null);

export function JourneyProvider({ children }: { children: React.ReactNode }) {
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [reflections, setReflections] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load from local storage or fallback to demo data
    const sJourneys = localStorage.getItem('emmaus_journeys');
    if (sJourneys) {
      setJourneys(JSON.parse(sJourneys));
    } else {
      setJourneys(DEMO_JOURNEYS);
      localStorage.setItem('emmaus_journeys', JSON.stringify(DEMO_JOURNEYS));
    }

    const sSteps = localStorage.getItem('emmaus_steps');
    if (sSteps) {
      setSteps(JSON.parse(sSteps));
    } else {
      setSteps(DEMO_STEPS);
      localStorage.setItem('emmaus_steps', JSON.stringify(DEMO_STEPS));
    }

    const sProgress = localStorage.getItem('emmaus_progress');
    if (sProgress) {
      setProgress(JSON.parse(sProgress));
    } else {
      setProgress(DEMO_PROGRESS);
      localStorage.setItem('emmaus_progress', JSON.stringify(DEMO_PROGRESS));
    }

    const sReflections = localStorage.getItem('emmaus_reflections');
    if (sReflections) {
      setReflections(JSON.parse(sReflections));
    }
  }, []);

  const getJourney = (id: string) => journeys.find(j => j.id === id);
  const getStep = (journeyId: string, day: number) => steps.find(s => s.journeyId === journeyId && s.day === day);

  const completeStep = (journeyId: string, day: number, reflectionText: string) => {
    const curProg = progress[journeyId] || { journeyId, currentDay: 1, completedDays: [], startedAt: new Date().toISOString(), lastCompletedAt: null };
    const completedDays = [...new Set([...curProg.completedDays, day])];
    
    const newProg = {
      ...curProg,
      completedDays,
      currentDay: Math.max(curProg.currentDay, day + 1),
      lastCompletedAt: new Date().toISOString()
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
      const newProg = { journeyId, currentDay: 1, completedDays: [], startedAt: new Date().toISOString(), lastCompletedAt: null };
      const nextProgress = { ...progress, [journeyId]: newProg };
      setProgress(nextProgress);
      localStorage.setItem('emmaus_progress', JSON.stringify(nextProgress));
    }
  };

  const updateJourney = (journey: Journey) => {
    const newJourneys = journeys.map(j => j.id === journey.id ? journey : j);
    setJourneys(newJourneys);
    localStorage.setItem('emmaus_journeys', JSON.stringify(newJourneys));
  };

  const updateStep = (step: Step) => {
    const newSteps = steps.map(s => (s.journeyId === step.journeyId && s.day === step.day) ? step : s);
    setSteps(newSteps);
    localStorage.setItem('emmaus_steps', JSON.stringify(newSteps));
  };

  return (
    <JourneyContext.Provider value={{
      journeys,
      progress,
      getJourney,
      getStep,
      completeStep,
      startJourney,
      updateJourney,
      updateStep,
      reflections
    }}>
      {children}
    </JourneyContext.Provider>
  );
}

export const useJourney = () => {
  const ctx = useContext(JourneyContext);
  if (!ctx) throw new Error('useJourney must be used within JourneyProvider');
  return ctx;
};
