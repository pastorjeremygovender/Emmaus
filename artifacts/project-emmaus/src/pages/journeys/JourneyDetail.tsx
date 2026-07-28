/**
 * JourneyDetail — member-facing Journey detail screen.
 * Route: /journeys/:id
 *
 * Layout (spec order):
 *   Cover → Title → Purpose → Description → Key Scripture →
 *   Related Sermons → Journey Info → Start Journey / Save → Steps
 */

import { useState, useMemo, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { useDailyGate, isGatedByDailyGate } from '@/lib/daily-gate';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import { getCollection } from '@/lib/collections-api';
import { getApiUrl } from '@/lib/api';
import {
  ChevronLeft, Bookmark, BookmarkCheck, Clock, Calendar,
  Footprints, BookOpen, ExternalLink, PlayCircle, Headphones,
} from 'lucide-react';
import type { Journey } from '@/contexts/JourneyContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SermonResult {
  sermonId: string;
  title: string;
  speaker: string;
  sermonDate?: string;
  matchingReference?: string;
  timestampedUrl: string;
  timestampLabel: string;
  audioUrl?: string;
  relativeStartSeconds?: number;
  relativeTimestampLabel?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rhythmLabel(j: Journey): string {
  const dur = (j.estimatedDuration ?? '').toLowerCase();
  if (dur.includes('daily') || dur.includes('per day')) return 'Daily';
  if (dur.includes('weekly') || dur.includes('per week')) return 'Weekly';
  if (dur.includes('guided')) return 'Guided';
  return 'Self-paced';
}

function timeLabel(j: Journey): string | null {
  if (!j.estimatedDuration) return null;
  const m = j.estimatedDuration.match(/(\d+)\s*(min|minute|hour)/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  const unit = m[2].toLowerCase().startsWith('h') ? 'hour' : 'minute';
  return `About ${n} ${unit}${n !== 1 ? 's' : ''} per step`;
}

/**
 * Parse a scripture reference string into { bookId, chapter } for Bible linking.
 * "John 3:16-17" → { bookId: "john", chapter: 3 }
 * "1 John 1:5"   → { bookId: "1john", chapter: 1 }
 * "Genesis 1"    → { bookId: "genesis", chapter: 1 }
 */
function parseScriptureRef(ref: string): { bookId: string; chapter: number; display: string } | null {
  if (!ref?.trim()) return null;
  // Take just the first reference if multiple separated by ; or ,
  const first = ref.split(/[;,]/)[0].trim();
  // Match: (book name with optional leading number) (chapter) optionally :verse
  const m = first.match(/^(.+?)\s+(\d+)(?::\d+.*)?$/);
  if (!m) return null;
  const bookId = m[1].toLowerCase().replace(/\s+/g, '');
  const chapter = parseInt(m[2]);
  if (isNaN(chapter)) return null;
  return { bookId, chapter, display: first };
}

function formatSermonDate(d?: string): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return d; }
}

// ─── Cover image ──────────────────────────────────────────────────────────────

function CoverImage({ url, title }: { url?: string; title: string }) {
  const [err, setErr] = useState(false);
  const initials = title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  if (!url || err) {
    return (
      <div className="w-full h-52 bg-primary/8 flex items-center justify-center rounded-2xl">
        <span className="text-primary/30 text-[36px] font-medium select-none">{initials}</span>
      </div>
    );
  }
  return (
    <img src={url} alt="" className="w-full h-52 object-cover rounded-2xl" onError={() => setErr(true)} />
  );
}

// ─── Sermon card ──────────────────────────────────────────────────────────────

function SermonCard({ sermon }: { sermon: SermonResult }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-xl border border-border bg-card">
      <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center shrink-0 mt-0.5">
        <Headphones size={16} className="text-primary/60" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-foreground line-clamp-2 leading-snug">
          {sermon.title}
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {sermon.speaker}
          {sermon.sermonDate ? ` · ${formatSermonDate(sermon.sermonDate)}` : ''}
        </p>
        {sermon.matchingReference && (
          <p className="text-[11px] font-medium text-primary mt-1">{sermon.matchingReference}</p>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {sermon.audioUrl && (
            <a
              href={sermon.timestampedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[12px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
            >
              <PlayCircle size={12} />
              {sermon.relativeTimestampLabel ? `Listen from ${sermon.relativeTimestampLabel}` : 'Listen'}
            </a>
          )}
          <a
            href={sermon.timestampedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink size={11} />
            {sermon.timestampLabel ? `Watch from ${sermon.timestampLabel}` : 'Watch on YouTube'}
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JourneyDetail() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const [, setLocation] = useLocation();
  const { journeys, progress, startJourney, getStepsForJourney, loading } = useJourney();
  const { user } = useAuth();
  const { getState, saveForLater, resumeJourney, canActivateMore } = useEnrollment();
  const { gateClear, coreJourney: coreJ } = useDailyGate();
  const { startSharedJourney } = useRooms();

  const [pendingStart, setPendingStart]       = useState(false);
  const [showLimitMsg, setShowLimitMsg]       = useState(false);
  const [collectionName, setCollectionName]   = useState<string | null>(null);
  const [sermons, setSermons]                 = useState<SermonResult[]>([]);
  const [sermonsLoaded, setSermonsLoaded]     = useState(false);

  const journey = journeys.find(j => j.id === journeyId);
  const prog = journey ? progress[journey.id] : undefined;
  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);
  const steps = journey ? getStepsForJourney(journey.id) : [];

  const enrollState = journey ? getState(journey.id) : 'active';
  const isStarted   = !!prog;
  const isCompleted = prog && journey ? prog.completedDays.length >= journey.durationDays : false;
  const isSaved     = enrollState === 'saved';
  const isPaused    = enrollState === 'paused' && isStarted;
  const isActive    = enrollState === 'active' && isStarted && !isCompleted;

  // Fetch collection name
  useEffect(() => {
    if (!journey?.collectionId) return;
    getCollection(journey.collectionId)
      .then(col => setCollectionName(col?.title ?? null))
      .catch(() => {});
  }, [journey?.collectionId]);

  // Fetch related sermons via preached-here when scriptureReference is set
  useEffect(() => {
    if (!journey?.scriptureReference) { setSermonsLoaded(true); return; }
    const parsed = parseScriptureRef(journey.scriptureReference);
    if (!parsed) { setSermonsLoaded(true); return; }
    const url = getApiUrl(
      `/api/youtube-archive/preached-here?bookId=${encodeURIComponent(parsed.bookId)}&chapter=${parsed.chapter}`
    );
    fetch(url)
      .then(r => r.ok ? r.json() : { chapterSermons: [], bookSermons: [] })
      .then((data: { chapterSermons?: SermonResult[]; bookSermons?: SermonResult[]; sermons?: SermonResult[] }) => {
        const results = (data.chapterSermons?.length ? data.chapterSermons : data.bookSermons) ?? data.sermons ?? [];
        setSermons(results.slice(0, 3));
        setSermonsLoaded(true);
      })
      .catch(() => setSermonsLoaded(true));
  }, [journey?.scriptureReference]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <main className="px-5 pt-6 max-w-[480px] mx-auto space-y-6">
          <div className="h-52 rounded-2xl bg-muted animate-pulse" />
          <div className="h-8 w-3/4 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-full rounded bg-muted animate-pulse" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24 flex items-center justify-center">
        <div className="text-center space-y-3 px-5">
          <p className="text-[16px] text-foreground font-medium">This Journey isn't available yet.</p>
          <Button variant="outline" onClick={() => setLocation('/journeys')}>Back to Next Steps</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Daily gate — applies to non-exempt, non-override growth journeys
  const isGated = !gateClear && isGatedByDailyGate(journey ?? { journeyType: '' } as any);

  function openCore() {
    if (!coreJ) { setLocation('/walk'); return; }
    if (!progress[coreJ.id]) startJourney(coreJ.id);
    const p = progress[coreJ.id];
    setLocation(`/journey/${coreJ.id}/day/${p?.currentDay ?? 1}`);
  }

  function handlePrimaryAction() {
    if (!journey) return;
    // Gate check — before core is done, redirect non-exempt journeys to core
    if (isGated && !isCompleted) { openCore(); return; }
    if (isActive) { setLocation(`/journey/${journey.id}/day/${prog!.currentDay}`); return; }
    if (isPaused) {
      if (canActivateMore(journeys, startedIds)) {
        resumeJourney(journey.id);
        setLocation(`/journey/${journey.id}/day/${prog!.currentDay}`);
      } else { setShowLimitMsg(true); }
      return;
    }
    if (isCompleted) { setLocation(`/journey/${journey.id}/day/1`); return; }
    if (!isExemptJourney(journey) && !canActivateMore(journeys, startedIds)) {
      setShowLimitMsg(true); return;
    }
    setPendingStart(true);
  }

  function handleStartAlone() {
    if (!journey) return;
    startJourney(journey.id);
    setLocation(`/journey/${journey.id}/day/1`);
    setPendingStart(false);
  }

  function handleStartWithRoom(roomId: string) {
    if (!journey || !user) return;
    startJourney(journey.id);
    startSharedJourney(roomId, journey.id, user.id);
    setLocation(`/journey/${journey.id}/day/1`);
    setPendingStart(false);
  }

  function toggleSave() {
    if (!journey) return;
    if (isSaved) resumeJourney(journey.id);
    else saveForLater(journey.id);
  }

  const primaryLabel =
    (isGated && !isCompleted) ? 'Complete today\'s 10 Minutes with Jesus' :
    isActive                   ? 'Continue'          :
    isPaused                   ? 'Continue Journey'  :
    isCompleted                ? 'Review Journey'    :
                                 'Open Journey';

  const rhythm = rhythmLabel(journey);
  const time   = timeLabel(journey);
  const scriptureRef = journey.scriptureReference ? parseScriptureRef(journey.scriptureReference) : null;

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-6 max-w-[480px] mx-auto space-y-6">

        {/* ── Back button ───────────────────────────────────────────── */}
        <button
          onClick={() => setLocation('/journeys')}
          className="flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground transition-colors -ml-0.5"
          aria-label="Back to Next Steps"
        >
          <ChevronLeft size={17} />
          Journeys
        </button>

        {/* ── Cover image ───────────────────────────────────────────── */}
        <CoverImage url={journey.coverImageUrl} title={journey.title} />

        {/* ── Title ─────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-sans font-medium tracking-tight text-foreground leading-snug">
            {journey.title}
          </h1>
          {/* Purpose / subtitle */}
          {journey.subtitle && (
            <p className="text-[14px] font-medium text-primary leading-snug">{journey.subtitle}</p>
          )}
        </div>

        {/* ── Description ───────────────────────────────────────────── */}
        {journey.description && (
          <p className="text-[15px] text-muted-foreground leading-relaxed">{journey.description}</p>
        )}

        {/* ── Collection badge ──────────────────────────────────────── */}
        {journey.collectionId && collectionName && (
          <button
            onClick={() => setLocation(`/journeys/collections/${journey!.collectionId}`)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-[13px] font-medium text-primary hover:bg-primary/10 transition-colors"
            aria-label={`View ${collectionName} collection`}
          >
            <BookOpen size={12} />
            {collectionName}
          </button>
        )}

        {/* ── Key Scripture ─────────────────────────────────────────── */}
        {scriptureRef && (
          <section className="space-y-2.5">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Key Scripture
            </h2>
            <button
              onClick={() => setLocation(`/bible/read/${scriptureRef.bookId}/${scriptureRef.chapter}`)}
              className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all group"
              aria-label={`Open ${scriptureRef.display} in Bible reader`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center shrink-0">
                    <BookOpen size={16} className="text-primary/70" />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-foreground">{scriptureRef.display}</p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Open in Emmaus Bible</p>
                  </div>
                </div>
                <ChevronLeft size={16} className="text-muted-foreground rotate-180 group-hover:text-primary transition-colors shrink-0" />
              </div>
            </button>
          </section>
        )}

        {/* ── Related Sermons ───────────────────────────────────────── */}
        {sermonsLoaded && sermons.length > 0 && (
          <section className="space-y-2.5">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Related Sermons
            </h2>
            <div className="space-y-2.5">
              {sermons.map((s, i) => <SermonCard key={s.sermonId ?? i} sermon={s} />)}
            </div>
          </section>
        )}

        {/* ── Journey information ───────────────────────────────────── */}
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Journey Information
          </h2>
          <div className="flex flex-wrap gap-2">
            {journey.durationDays > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-[13px] text-muted-foreground">
                <Calendar size={13} />
                {journey.durationDays} {journey.durationDays === 1 ? 'Day' : 'Days'}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-[13px] text-muted-foreground">
              <Footprints size={13} />
              {rhythm}
            </span>
            {time && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-[13px] text-muted-foreground">
                <Clock size={13} />
                {time}
              </span>
            )}
            {steps.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-[13px] text-muted-foreground">
                {steps.length} Steps
              </span>
            )}
          </div>
        </section>

        {/* ── Progress (if started) ─────────────────────────────────── */}
        {isActive && prog && (
          <div className="space-y-2 p-4 rounded-xl bg-primary/5 border border-primary/15">
            <p className="text-[13px] font-medium text-primary">Step {prog.currentDay} of {journey.durationDays}</p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((prog.completedDays.length / (journey.durationDays || 1)) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {isPaused && prog && (
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-[13px] text-muted-foreground">Paused at Step {prog.currentDay} of {journey.durationDays}</p>
          </div>
        )}
        {isCompleted && (
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-[13px] text-muted-foreground">Journey complete · {journey.durationDays} steps finished</p>
          </div>
        )}

        {/* ── Journey limit message ─────────────────────────────────── */}
        {showLimitMsg && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-[14px] text-amber-900 leading-relaxed">
              You're already walking through five journeys. To begin another one, pause or complete one of your current journeys.
            </p>
            <button
              className="mt-2 text-[13px] text-amber-700 font-medium hover:underline"
              onClick={() => { setShowLimitMsg(false); setLocation('/journeys'); }}
            >
              Manage My Journeys →
            </button>
          </div>
        )}

        {/* ── Primary action + save ─────────────────────────────────── */}
        <div className="space-y-2.5">
          <Button
            className="w-full h-12 rounded-xl font-medium"
            style={{ fontSize: isGated && !isCompleted ? '14px' : '16px' }}
            onClick={handlePrimaryAction}
          >
            {primaryLabel}
          </Button>
          {isGated && !isCompleted && (
            <p className="text-[12px] text-muted-foreground text-center leading-snug">
              Begin with today's time with Jesus. Your Journey will be ready afterwards.
            </p>
          )}
          {!isStarted && (
            <button
              onClick={toggleSave}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] text-muted-foreground hover:text-foreground border border-border hover:border-primary/30 transition-all"
              aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
            >
              {isSaved
                ? <><BookmarkCheck size={16} className="text-primary" /> Saved</>
                : <><Bookmark size={16} /> Save for later</>}
            </button>
          )}
        </div>

        {/* ── Step overview ─────────────────────────────────────────── */}
        {steps.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              {steps.length} Steps
            </h2>
            <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {steps.map(s => {
                const done = prog?.completedDays.includes(s.day);
                return (
                  <div key={s.day} className="flex items-start gap-3 px-4 py-3.5 bg-card">
                    <span className={`text-[12px] font-medium w-6 shrink-0 mt-0.5 ${done ? 'text-primary' : 'text-muted-foreground'}`}>
                      {s.day}
                    </span>
                    <span className={`text-[14px] leading-snug flex-1 ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {s.title || `Step ${s.day}`}
                    </span>
                    {done && <span className="ml-auto text-primary text-[11px] font-medium shrink-0">Done</span>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

      </main>

      <BottomNav />

      {pendingStart && (
        <JourneyStartModal
          journeyId={journey.id}
          journeyTitle={journey.title}
          onClose={() => setPendingStart(false)}
          onStartAlone={handleStartAlone}
          onStartWithRoom={handleStartWithRoom}
        />
      )}
    </div>
  );
}
