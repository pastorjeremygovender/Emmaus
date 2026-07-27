import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Check, PlayCircle, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { isCompletedToday } from '@/lib/daily-lock';

/** Parse a scripture reference into the Bible reader path.
 *  "John 1:35-39"  →  "/bible/read/john/1"
 *  "1 John 4:7"    →  "/bible/read/1-john/4"
 */
function parseBibleLink(ref: string): string {
  const match = ref.trim().match(/^(\d\s+)?([A-Za-z]+)\s+(\d+)/);
  if (!match) return '/bible/books';
  const num  = match[1] ? match[1].trim() + '-' : '';
  const book = (num + match[2]).toLowerCase();
  const ch   = match[3];
  return `/bible/read/${book}/${ch}`;
}

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
  const { getStep, completeStep, startJourney, getJourney, loading, progress } = useJourney();
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

  const [reflection, setReflection] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [showSharePrompt, setShowSharePrompt] = useState(false);
  const [sharedRoomId, setSharedRoomId] = useState<string | null>(null);
  const [sharingDone, setSharingDone] = useState(false);

  useEffect(() => {
    if (journeyId) startJourney(journeyId);
    window.scrollTo(0, 0);
  }, [journeyId]);

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
                Back to Walk
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="p-6 text-center mt-20 text-muted-foreground">
        Journey step not found.
      </div>
    );
  }

  const isCompanion = journey.journeyType === 'companion';
  const hasSermon = isCompanion && (step as any).sermonTimestampSeconds != null;

  // Find rooms where user is doing this journey (to offer sharing)
  const myRooms = user ? getMyRooms(user.id) : [];
  const activeRoomsForJourney = journeyId
    ? myRooms.filter(room => {
        const invitations = getJourneyInvitations(room.id);
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
      setShowSharePrompt(true);
      setIsCompleting(true);
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

  // Completion screens
  if (isCompleting) {
    // ── Journey complete — final step ──────────────────────────────────────
    if (isFinalStep) {
      const nextJourney = journey.nextJourneyId ? (getJourney(journey.nextJourneyId) ?? null) : null;

      return (
        <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-4 max-w-[340px] w-full"
          >
            <div className="w-20 h-20 bg-primary/15 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={36} strokeWidth={2.5} />
            </div>
            <h2 className="text-[28px] font-serif font-medium leading-snug">Journey Complete.</h2>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              You've finished <strong>{journey.title}</strong>. Well done.
            </p>
            {sharedRoomId && (
              <p className="text-[13px] text-primary">Your reflection has been shared with your Room.</p>
            )}
            {/* Next journey recommendation */}
            {nextJourney && (
              <div className="mt-2 p-4 rounded-2xl border border-border bg-card text-left">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Up Next
                </p>
                <p className="text-[15px] font-medium text-foreground">{nextJourney.title}</p>
                {nextJourney.description && (
                  <p className="text-[13px] text-muted-foreground mt-1 leading-snug line-clamp-2">
                    {nextJourney.description}
                  </p>
                )}
                <Button
                  className="w-full mt-3 rounded-xl h-10 text-[14px]"
                  onClick={() => setLocation(`/journeys/${nextJourney.id}`)}
                >
                  View Journey
                </Button>
              </div>
            )}
            <div className="pt-2 flex flex-col gap-2.5">
              <Button
                variant="outline"
                className="rounded-xl px-8 w-full"
                onClick={() => setLocation('/journeys')}
              >
                My Journeys
              </Button>
              <Button
                variant="ghost"
                className="rounded-xl px-8 w-full text-muted-foreground"
                onClick={() => setLocation('/walk')}
              >
                Back to Walk
              </Button>
            </div>
          </motion.div>
        </div>
      );
    }

    // ── Regular step completed — "See you tomorrow" ────────────────────────
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4 max-w-[320px]"
        >
          <div className="w-16 h-16 bg-primary/15 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={30} strokeWidth={2.5} />
          </div>
          <h2 className="text-[26px] font-serif font-medium">Great job.</h2>
          <p className="text-base text-muted-foreground">See you tomorrow.</p>
          {sharedRoomId && (
            <p className="text-[13px] text-primary">Your reflection has been shared with your Room.</p>
          )}
          <div className="pt-6">
            <Button variant="outline" className="rounded-xl px-8" onClick={() => setLocation('/walk')}>
              Back to Walk
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-32">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation('/walk')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to Walk"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm text-foreground truncate leading-tight">
              {isDailyRhythmJourney ? '10 Minutes with Jesus' : journey.title}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {isDailyRhythmJourney ? `Day ${day}` : `Day ${day} of ${journey.durationDays}`}
            </div>
          </div>
          {/* spacer to balance the back arrow */}
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-10 max-w-[640px] mx-auto">

        {/* Day label + title */}
        <section className="mb-12">
          {isDailyRhythmJourney ? (
            /* Daily Rhythm: centered hierarchy per spec */
            <div className="text-center">
              <p className="text-[28px] font-bold text-foreground leading-tight mb-2">
                10 Minutes with Jesus
              </p>
              <p className="text-[15px] font-medium text-muted-foreground mb-3">
                Day {day}
              </p>
              <h1 className="text-[26px] font-bold text-foreground leading-snug">
                {step.title}
              </h1>
            </div>
          ) : (
            <>
              <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                Day {day}
              </span>
              <h1 className="mt-2 text-[32px] font-serif font-semibold leading-tight">
                {step.title}
              </h1>
            </>
          )}
        </section>

        {/* Mentor introduction */}
        {step.mentorIntro ? (
          <section className="mb-12">
            <p className="text-[18px] text-foreground leading-[1.8]">
              {step.mentorIntro}
            </p>
          </section>
        ) : null}

        {/* Scripture */}
        <section className="mb-12">
          <SectionLabel>Scripture</SectionLabel>
          <p className="mt-3 text-[18px] text-foreground leading-[1.8]">
            {step.scripture}
          </p>
          {isDailyRhythmJourney && step.scripture && (
            <button
              onClick={() => setLocation(parseBibleLink(step.scripture))}
              className="mt-2 text-[14px] text-primary font-medium hover:underline"
            >
              Read in Bible
            </button>
          )}
        </section>

        {/* Devotional reflection */}
        <section className="mb-12">
          <SectionLabel>Reflection</SectionLabel>
          <p className="mt-3 text-[18px] leading-[1.8] text-foreground">
            {step.devotional}
          </p>
        </section>

        {/* Sermon moment — placed here for companion journeys */}
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

        {/* Reflection question + optional response — hidden for daily-rhythm */}
        {!isDailyRhythmJourney && (
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
        )}

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

        {/* Closing text — daily-rhythm only */}
        {isDailyRhythmJourney && (
          <section className="mb-8">
            <p className="text-[16px] text-muted-foreground leading-relaxed">
              Tomorrow we'll continue walking together.
            </p>
          </section>
        )}

        {/* Completion / navigation button */}
        <div className="pt-2 pb-8">
          {isDailyRhythmJourney ? (
            isDailyRhythmReadOnly ? (
              <Button
                size="lg"
                variant="outline"
                className="w-full h-14 text-[17px] rounded-2xl"
                onClick={() => setLocation('/walk')}
              >
                Back to Walk
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
          ) : (
            <Button
              size="lg"
              className="w-full h-14 text-[17px] rounded-2xl"
              onClick={handleComplete}
              data-testid="button-complete-today"
            >
              Complete Today
            </Button>
          )}
        </div>

      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </h2>
  );
}
