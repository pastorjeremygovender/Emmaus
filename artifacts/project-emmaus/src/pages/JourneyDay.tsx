import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Check, PlayCircle, Eye, EyeOff } from 'lucide-react';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
import { resolveReturn } from '@/lib/return-context';
import { motion } from 'framer-motion';
import { isCompletedToday } from '@/lib/daily-lock';
import { DailyRhythmReading, SectionLabel, resolveDisplayName } from '@/components/DailyRhythmReading';
import { getStepLabel } from '@/lib/step-label';
import { EmbeddedScripture } from '@/components/EmbeddedScripture';
import { ShareButton } from '@/components/ShareButton';
import { ShareImageCard } from '@/components/ShareImageCard';
import { BottomNav } from '@/components/BottomNav';
import { dismissBadge } from '@/lib/badge-api';
import { recordView } from '@/lib/history-api';

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function JourneyDay() {
  const { journeyId, day: dayStr } = useParams<{ journeyId: string; day: string }>();
  const day = parseInt(dayStr || '1', 10);
  const [, setLocation] = useLocation();
  const { getStep, getStepsForJourney, completeStep, startJourney, getJourney, loading, progress } = useJourney();
  const { user } = useAuth();
  const {
    getMyRooms,
    getJourneyInvitations,
    getMyParticipation,
    shareReflection,
    getMySharedReflection,
  } = useRooms();

  const step = getStep(journeyId || '', day);
  const journey = getJourney(journeyId || '');
  const journeyProgress = journeyId ? progress[journeyId] : undefined;
  const isDailyRhythmJourney = journey?.journeyType === 'daily-rhythm';
  // Day is read-only if it's already been completed (any time — past or today)
  const isDayCompleted = journeyProgress?.completedDays?.includes(day) ?? false;
  const isDailyRhythmReadOnly = isDailyRhythmJourney && isDayCompleted;

  // Record history view (fire-and-forget)
  useEffect(() => {
    if (journey && step && journeyId) {
      recordView({
        contentType: journey.journeyType === 'bible-study' ? 'bible-study' : 'journey',
        contentId: journeyId,
        contentTitle: journey.title,
        contentRoute: `/journey/${journeyId}/day/${day}`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journeyId, day]);

  // All published steps for this journey — used to resolve the next lesson in the completion card.
  const allSteps = getStepsForJourney(journeyId || '');

  // Read return context from URL — set by the navigation caller
  const source   = new URLSearchParams(window.location.search).get('source');
  const sourceId = new URLSearchParams(window.location.search).get('sourceId');

  // URL for the dedicated Walk Complete page — used when the final step is done.
  const walkCompleteUrl = journeyId
    ? `/journey/${journeyId}/complete?source=${encodeURIComponent(source ?? 'nextStepsJourneys')}${sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : ''}`
    : '/journeys?tab=journeys';

  const [reflection, setReflection] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [sharedRoomId, setSharedRoomId] = useState<string | null>(null);
  const [sharingDone, setSharingDone] = useState(false);

  useEffect(() => {
    if (journeyId) {
      startJourney(journeyId);
      // Clear UPDATED badge — member has opened the content (fire-and-forget).
      void dismissBadge('journey', journeyId);
      // Restore a hidden Walk to Today's Steps — idempotent if not hidden.
      // Covers the primary Next Steps → Continue path (direct to /journey/:id/day/:n)
      // which bypasses JourneyDetail. Both routes now issue the unhide on open.
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      fetch(
        `${base}/api/engagements/journey/${encodeURIComponent(journeyId)}/unhide`,
        { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } },
      ).catch(() => { /* non-fatal */ });
    }
    window.scrollTo(0, 0);
  }, [journeyId]);

  // After the final step is completed (and any sharing prompt resolved),
  // navigate to the dedicated Walk Complete page instead of showing an inline card.
  useEffect(() => {
    if (
      isCompleting &&
      !isDailyRhythmJourney &&
      journey?.durationDays != null &&
      journey.durationDays > 0 &&
      day >= journey.durationDays &&
      (!showSharePrompt || sharingDone)
    ) {
      setLocation(walkCompleteUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleting, showSharePrompt, sharingDone]);

  // Route guard — redirect non-Daily-Rhythm journeys when the requested step
  // is unavailable (unpublished, missing, or out of range). Uses replace so Back
  // doesn't loop the user back into the dead end.
  // Daily Rhythm has its own "You're ahead of the rhythm" placeholder — preserved.
  useEffect(() => {
    if (loading) return;
    if (!journey || isDailyRhythmJourney) return;
    if (!step) {
      const { path } = resolveReturn(source, sourceId, '/journeys?tab=journeys');
      setLocation(path, { replace: true });
    }
    // source/sourceId are stable (from URL params read at mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, journey, step, isDailyRhythmJourney]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-[14px]">Loading…</span>
        </div>
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="p-6 text-center mt-20 text-muted-foreground">
        Journey not found.
      </div>
    );
  }

  if (!step) {
    // Daily Rhythm: day content may not be authored yet — show a calm placeholder.
    if (isDailyRhythmJourney) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
          <div className="text-center space-y-4 max-w-[320px]">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Check size={28} className="text-primary" />
            </div>
            <h2 className="text-[22px] font-serif font-medium">You're ahead of the rhythm.</h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Today's 10 Minutes with Jesus will be ready soon. Check back later.
            </p>
            <div className="pt-4">
              <Button variant="outline" className="rounded-xl px-8" onClick={() => setLocation('/walk')}>
                Back to Today's Steps
              </Button>
            </div>
          </div>
        </div>
      );
    }
    // Non-Daily-Rhythm: redirect handled by the route-guard useEffect above.
    return null;
  }

  const isCompanion = journey.journeyType === 'companion';
  const hasSermon = isCompanion && (step as any).sermonTimestampSeconds != null;

  // Find rooms where user is doing this journey (to offer sharing)
  const myRooms = user ? getMyRooms(user.id) : [];
  const activeRoomsForJourney = journeyId
    ? myRooms.filter(room => {
        const invitations = getJourneyInvitations(room.id) as any[];
        return invitations.some(ji => ji.journeyId === journeyId && ji.status === 'open');
      })
    : [];

  const reflectionKey = `${journeyId}-${day}`;

  // Daily Rhythm journeys never reach a "final step" — they continue indefinitely.
  const isFinalStep = !isDailyRhythmJourney && journey.durationDays > 0 && day >= journey.durationDays;

  const handleComplete = () => {
    // Daily Rhythm: complete and navigate directly to Walk (no intermediate screen)
    if (isDailyRhythmJourney) {
      completeStep(journey.id, day, '');
      setLocation('/walk');
      return;
    }
    completeStep(journey.id, day, reflection);
    if (reflection.trim() && activeRoomsForJourney.length > 0) {
      // Show reflection-sharing prompt first; the useEffect above navigates to
      // Walk Complete (final step) or shows the lesson card (non-final) after.
      setShowSharePrompt(true);
      setIsCompleting(true);
    } else if (isFinalStep) {
      // Final step, no reflection to share — go straight to Walk Complete.
      setLocation(walkCompleteUrl);
    } else {
      setIsCompleting(true);
    }
  };

  const handleShareReflection = (roomId: string) => {
    if (!user || !journeyId) return;
    const stepId = `day-${day}`;
    shareReflection(user.id, reflectionKey, roomId, journeyId, stepId);
    setSharedRoomId(roomId);
    setSharingDone(true);
  };

  const handleSkipShare = () => {
    setSharingDone(true);
  };

  // Share prompt screen (between completing and the final "Great job" screen)
  if (isCompleting && showSharePrompt && !sharingDone && activeRoomsForJourney.length > 0) {
    const firstRoom = activeRoomsForJourney[0];
    const alreadyShared = user
      ? getMySharedReflection(user.id, reflectionKey, firstRoom.id)
      : undefined;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-5 max-w-[340px]"
        >
          <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-3">
            <Eye size={26} />
          </div>
          <h2 className="text-[22px] font-serif font-medium">Share your reflection?</h2>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Share this reflection with <strong>{firstRoom.name}</strong>
          </p>
          <div className="p-4 bg-card border border-border rounded-xl text-left">
            <p className="text-[14px] text-foreground italic leading-relaxed">
              "{reflection.trim()}"
            </p>
          </div>
          <p className="text-[12px] text-muted-foreground">
            Only this reflection will be shared. You can revoke sharing at any time from the Room discussion.
          </p>

          {!alreadyShared ? (
            <div className="space-y-2.5 pt-2">
              <Button
                className="w-full rounded-2xl h-12"
                onClick={() => handleShareReflection(firstRoom.id)}
              >
                Share this reflection with {firstRoom.name}
              </Button>
              <Button
                variant="ghost"
                className="w-full rounded-2xl"
                onClick={handleSkipShare}
              >
                <EyeOff size={15} className="mr-1.5" />
                Keep private
              </Button>
            </div>
          ) : (
            <div className="space-y-2.5 pt-2">
              <p className="text-[13px] text-primary">Already shared with this Room.</p>
              <Button variant="outline" className="w-full rounded-2xl" onClick={handleSkipShare}>
                Continue
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  // ── Shared completion-path variables ─────────────────────────────────────────
  // Hoisted above isCompleting so the same values are used in both the
  // just-completed full-screen card and the isDayCompleted replay footer.
  const returnPath = resolveReturn(source, sourceId, '/journeys?tab=journeys').path;
  const nextStep = allSteps.find(s => s.day > day);
  const nextStepUrl = !isFinalStep && nextStep && journeyId
    ? `/journey/${journeyId}/day/${nextStep.day}${source ? `?source=${encodeURIComponent(source)}` : '?source=nextStepsJourneys'}${sourceId ? `&sourceId=${encodeURIComponent(sourceId)}` : ''}`
    : undefined;

  // ── Completion card — standard Emmaus pattern (spec-locked) ──────────────────
  if (isCompleting) {
    // Final step: the useEffect above is navigating to the Walk Complete page.
    // Return null to avoid flashing the completion card in the meantime.
    if (isFinalStep) return null;

    return (
      <EmmausCompletionCard
        fullScreen
        heading={`${getStepLabel({ day, displayLabel: (step as any)?.displayLabel ?? null }, journey)} complete.`}
        subMessage="Continue when you're ready."
        onContinue={nextStepUrl ? () => setLocation(nextStepUrl) : undefined}
        continueLabel={nextStepUrl ? 'Continue to Next Day' : undefined}
        returnLabel="Back to Next Steps"
        onReturn={() => setLocation(returnPath)}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          {/* Back button — returns to the source context (Next Steps, Walk overview, etc.) */}
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(isDailyRhythmJourney ? '/walk' : resolveReturn(source, sourceId, '/journeys?tab=journeys').path); }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm text-foreground truncate leading-tight">
              {isDailyRhythmJourney ? '10 Minutes with Jesus' : journey.title}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {isDailyRhythmJourney
              ? getStepLabel({ day, displayLabel: (step as any).displayLabel }, journey)
              : `${getStepLabel({ day, displayLabel: (step as any).displayLabel }, journey)} of ${journey.durationDays}`}
            </div>
          </div>
          {/* spacer to balance the back arrow */}
          <div className="min-w-[44px]" />
        </div>
      </header>

      {isDailyRhythmJourney ? (

        /* ── Daily Rhythm — rendered from shared source of truth ─────────── */
        <DailyRhythmReading
          day={day}
          title={step.title}
          mentorIntro={step.mentorIntro}
          memberName={resolveDisplayName(user?.preferredName)}
          scripture={step.scripture}
          devotional={step.devotional}
          prayerPrompt={step.prayerPrompt}
          actionStep={step.actionStep}
          closingText={(step as any).closingText}
          displayLabel={getStepLabel({ day, displayLabel: (step as any).displayLabel }, journey)}
          returnPath={`/journey/${journeyId}/day/${day}`}
          sharePayload={{
            title: journey.title ?? '10 Minutes with Jesus',
            dayTitle: step.title,
            scripture: step.scripture ?? undefined,
            greeting: step.mentorIntro ?? undefined,
            reflection: step.devotional ?? undefined,
            prayer: step.prayerPrompt ?? undefined,
            nextStep: step.actionStep ?? undefined,
            closing: (step as any).closingText ?? undefined,
          }}
          actionButton={
            isDailyRhythmReadOnly ? (
              <Button
                size="lg"
                variant="outline"
                className="w-full h-14 text-[17px] rounded-2xl"
                onClick={() => setLocation('/walk')}
              >
                Back to Today's Steps
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full h-14 text-[17px] rounded-2xl"
                onClick={handleComplete}
                data-testid="button-complete-today"
              >
                Continue
              </Button>
            )
          }
        />

      ) : (

        /* ── Regular journey ─────────────────────────────────────────────── */
        <main className="px-5 pt-10 max-w-[640px] mx-auto">

          {/* Day label + title */}
          <section className="mb-12">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              {getStepLabel({ day, displayLabel: (step as any).displayLabel }, journey)}
            </span>
            <h1 className="mt-2 text-[32px] font-serif font-semibold leading-tight">
              {step.title}
            </h1>
          </section>

          {/* Mentor introduction */}
          {step.mentorIntro ? (
            <section className="mb-12">
              <p className="text-[18px] text-foreground leading-[1.8]">
                {step.mentorIntro}
              </p>
            </section>
          ) : null}

          {/* Scripture — uses the shared EmbeddedScripture pipeline (same as Daily Rhythm,
              Devotionals, Sermon Companions) so the reference is parsed, the passage
              fetched from the Bible API, and loading/error states are surfaced. */}
          {step.scripture && (
            <section className="mb-12">
              <SectionLabel>Scripture</SectionLabel>
              <div className="mt-3">
                <EmbeddedScripture
                  scripture={step.scripture}
                  returnPath={`/journey/${journeyId}/day/${day}`}
                />
              </div>
            </section>
          )}

          {/* Devotional reflection */}
          <section className="mb-12">
            <SectionLabel>Reflection</SectionLabel>
            <p className="mt-3 text-[18px] leading-[1.8] text-foreground">
              {step.devotional}
            </p>
          </section>

          {/* Sermon moment */}
          {hasSermon && (
            <section className="mb-12">
              <SectionLabel>Sermon Moment</SectionLabel>
              <p className="mt-3 text-[17px] text-foreground leading-[1.8]">
                This moment in Sunday's sermon connects directly with today's reflection.
              </p>
              <a
                href={(step as any).sermonLink}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-2 text-primary font-medium text-[15px] hover:underline"
                aria-label={`Watch sermon from ${formatTimestamp((step as any).sermonTimestampSeconds)}`}
              >
                <PlayCircle size={18} className="shrink-0" />
                Watch from {formatTimestamp((step as any).sermonTimestampSeconds)}
              </a>
            </section>
          )}

          {/* Reflection question + optional response */}
          <section className="mb-12">
            <SectionLabel>Consider</SectionLabel>
            <p className="mt-3 text-[18px] text-foreground leading-[1.8]">
              {step.reflectionQuestion}
            </p>
            <Textarea
              placeholder="What stood out to you today?"
              className="mt-4 min-h-[120px] text-[17px] resize-none rounded-xl"
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              data-testid="input-reflection"
              aria-label="Your reflection"
            />
          </section>

          {/* Prayer */}
          <section className="mb-12">
            <SectionLabel>Prayer</SectionLabel>
            <p className="mt-3 text-[18px] text-foreground leading-[1.8]">
              {step.prayerPrompt}
            </p>
          </section>

          {/* Action step */}
          <section className="mb-12">
            <SectionLabel>Your Next Step</SectionLabel>
            <p className="mt-3 text-[18px] text-foreground leading-[1.8]">
              {step.actionStep}
            </p>
          </section>

          {/* Share image — "Take this with you" */}
          {(step as any).shareImageUrl && (
            <ShareImageCard shareImageUrl={(step as any).shareImageUrl} />
          )}

          {/* Share */}
          <ShareButton payload={{
            title: journey?.title ?? 'Emmaus',
            dayTitle: step.title,
            scripture: step.scripture ?? undefined,
            greeting: step.mentorIntro ?? undefined,
            reflection: step.devotional ?? undefined,
            prayer: step.prayerPrompt ?? undefined,
            nextStep: step.actionStep ?? undefined,
            closing: (step as any).closingText ?? undefined,
          }} />

          {/* Primary action — "Finished" for a fresh read; completion card for replay */}
          <div className="pt-2 pb-8">
            {isDayCompleted ? (
              /* Already completed — review mode. Show the standard completion card
                 with Continue to Next Day (if a next published step exists) or
                 View Walk Summary (if this was the final step). */
              <EmmausCompletionCard
                heading={`${getStepLabel({ day, displayLabel: (step as any)?.displayLabel ?? null }, journey)} complete.`}
                subMessage="Continue when you're ready."
                onContinue={
                  nextStepUrl
                    ? () => setLocation(nextStepUrl)
                    : isFinalStep
                    ? () => setLocation(walkCompleteUrl)
                    : undefined
                }
                continueLabel={
                  nextStepUrl
                    ? 'Continue to Next Day'
                    : isFinalStep
                    ? 'View Walk Summary'
                    : undefined
                }
                returnLabel="Back to Next Steps"
                onReturn={() => setLocation(returnPath)}
              />
            ) : (
              <Button
                size="lg"
                className="w-full h-14 text-[17px] rounded-2xl"
                onClick={handleComplete}
                data-testid="button-complete-today"
              >
                Finished
              </Button>
            )}
          </div>

        </main>
      )}
      <BottomNav />
    </div>
  );
}
