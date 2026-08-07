import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { AskEmmausBar } from '@/components/AskEmmausBar';
import { FavouriteButton } from '@/components/FavouriteButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  LogOut, Users, ChevronRight, Pencil, Check, X, Plus, LogIn,
  Star, Clock, BookOpen, Headphones, Map, Loader2,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  fetchNextSteps,
  type NextStepsItem,
  type NextStepsData,
} from '@/lib/next-steps-api';
import { fetchFavourites, type Favourite } from '@/lib/favourites-api';
import { fetchHistory, historyTimeLabel, type HistoryEntry } from '@/lib/history-api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function streakLabel(n: number): string {
  if (n === 0) return 'Your walk begins today';
  if (n === 1) return '1 day walking';
  return `${n} days walking`;
}

const CONTENT_ICON: Record<string, React.ElementType> = {
  journey:            Map,
  'bible-study':      BookOpen,
  devotional:         BookOpen,
  'sermon-companion': Headphones,
  sermon:             Headphones,
  'bible-verse':      BookOpen,
  'bible-chapter':    BookOpen,
  'ask-emmaus':       Star,
  room:               Users,
};

const CONTENT_LABEL: Record<string, string> = {
  journey:            'Walk',
  'bible-study':      'Bible Study',
  devotional:         'Devotional',
  'sermon-companion': 'Sermon Companion',
  sermon:             'Sermon',
  'bible-verse':      'Bible Verse',
  'bible-chapter':    'Bible Chapter',
  'ask-emmaus':       'Ask Emmaus',
  room:               'Room',
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </h2>
      {children}
    </section>
  );
}

// ─── Progress item row ────────────────────────────────────────────────────────

function ProgressRow({
  item,
  onOpen,
}: {
  item: NextStepsItem;
  onOpen: () => void;
}) {
  const Icon = CONTENT_ICON[item.contentType] ?? BookOpen;
  const stateLabel =
    item.memberProgressState === 'completed' ? 'Completed' :
    item.memberProgressState === 'in-progress' ? 'In Progress' :
    item.memberProgressState === 'paused' ? 'Paused' : '';

  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
    >
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-foreground leading-snug truncate">{item.title}</p>
        {stateLabel && (
          <p className="text-[12px] text-muted-foreground mt-0.5">{stateLabel}</p>
        )}
      </div>
      <ChevronRight size={15} className="text-muted-foreground shrink-0" />
    </button>
  );
}

// ─── Favourite row ────────────────────────────────────────────────────────────

function FavouriteRow({
  fav,
  onOpen,
  onRefresh,
}: {
  fav: Favourite;
  onOpen: () => void;
  onRefresh: () => void;
}) {
  const Icon = CONTENT_ICON[fav.content_type] ?? BookOpen;
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
      <button onClick={onOpen} className="flex-1 flex items-center gap-3 min-w-0 text-left">
        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-foreground leading-snug truncate">
            {fav.content_title}
          </p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {CONTENT_LABEL[fav.content_type] ?? fav.content_type}
          </p>
        </div>
      </button>
      <FavouriteButton
        contentType={fav.content_type as Parameters<typeof FavouriteButton>[0]['contentType']}
        contentId={fav.content_id}
        contentTitle={fav.content_title}
        contentRoute={fav.content_route}
        className="shrink-0"
        size={16}
      />
    </div>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ entry, onOpen }: { entry: HistoryEntry; onOpen: () => void }) {
  const Icon = CONTENT_ICON[entry.content_type] ?? BookOpen;
  return (
    <button
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
    >
      <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <Icon size={15} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-foreground leading-snug truncate">
          {entry.content_title}
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {historyTimeLabel(entry.viewed_at)}
        </p>
      </div>
      <Clock size={13} className="text-muted-foreground/50 shrink-0" />
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Personal() {
  const { user, signOut, updateName } = useAuth();
  const { progress, reflections, journeys } = useJourney();
  const { getMyRooms, getUnreadCount } = useRooms();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // ── Profile editing ────────────────────────────────────────────────────────
  const [prayerRequest, setPrayerRequest] = useState('');
  const [notifs, setNotifs] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // ── Next steps data (for Continue / Completed) ─────────────────────────────
  const [nextStepsData, setNextStepsData] = useState<NextStepsData | null>(null);
  const [nextStepsLoading, setNextStepsLoading] = useState(true);

  // ── Favourites ─────────────────────────────────────────────────────────────
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [favsLoading, setFavsLoading] = useState(true);

  // ── History ────────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  const loadData = useCallback(async () => {
    setNextStepsLoading(true);
    setFavsLoading(true);
    setHistLoading(true);
    try {
      const [ns, favs, hist] = await Promise.all([
        fetchNextSteps(),
        fetchFavourites(),
        fetchHistory(30),
      ]);
      setNextStepsData(ns);
      setFavourites(favs);
      setHistory(hist);
    } catch { /* non-fatal */ }
    finally {
      setNextStepsLoading(false);
      setFavsLoading(false);
      setHistLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!user) return null;

  // ── Derived ────────────────────────────────────────────────────────────────

  const myRooms = getMyRooms(user.id);
  const roomUnread = getUnreadCount(user.id);

  const coreJourneyId = '15-minutes-with-jesus';
  const coreProg = progress[coreJourneyId];
  const streak = coreProg ? coreProg.completedDays.length : 0;

  const savedReflections = Object.entries(reflections).map(([key, text]) => {
    const [jId, day] = key.split('-');
    const j = journeys.find((jx) => jx.id === jId);
    return { title: j ? `${j.title} — Day ${day}` : `Day ${day}`, text };
  });

  // Aggregate all in-progress and completed items from nextSteps API
  const allItems: NextStepsItem[] = nextStepsData
    ? [
        ...nextStepsData.dailyDevotionals,
        ...nextStepsData.standaloneJourneys,
        ...(nextStepsData.currentSermonCompanion ? [nextStepsData.currentSermonCompanion] : []),
        ...nextStepsData.previousSermonCompanions,
        ...nextStepsData.journeyCollections.flatMap((c) => c.journeys),
      ]
    : [];

  const continueItems = allItems.filter(
    (i) => i.memberProgressState === 'in-progress' || i.memberProgressState === 'paused',
  );
  const completedItems = allItems.filter(
    (i) => i.memberProgressState === 'completed',
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSignOut = () => { signOut(); setLocation('/'); };

  const handleSavePrayer = () => {
    if (!prayerRequest.trim()) return;
    const existing = JSON.parse(localStorage.getItem('emmaus_prayers') || '[]') as string[];
    existing.push(prayerRequest.trim());
    localStorage.setItem('emmaus_prayers', JSON.stringify(existing));
    setPrayerRequest('');
    toast({ title: 'Saved', description: 'Your prayer request has been saved.' });
  };

  const displayedName = user.preferredName?.trim() || '';
  const initials = displayedName
    ? displayedName.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleOpenNameEdit = () => { setNameInput(displayedName); setEditingName(true); };
  const handleSaveName = () => {
    const name = nameInput.trim();
    updateName(name);
    setEditingName(false);
    toast({ title: 'Name updated', description: name ? `We'll call you ${name}.` : 'Your name has been cleared.' });
  };
  const handleCancelNameEdit = () => { setEditingName(false); setNameInput(''); };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-9">

        {/* Profile header */}
        <header className="flex items-center gap-5">
          <div
            className="w-[64px] h-[64px] rounded-full bg-primary/10 text-primary flex items-center justify-center text-[22px] font-sans font-semibold shrink-0"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') handleCancelNameEdit(); }}
                  placeholder="Your name"
                  autoFocus
                  className="flex-1 h-9 px-3 rounded-lg border border-input bg-background text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0"
                />
                <button onClick={handleSaveName} className="text-primary hover:text-primary/80 transition-colors shrink-0" aria-label="Save name">
                  <Check size={17} />
                </button>
                <button onClick={handleCancelNameEdit} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="Cancel">
                  <X size={17} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-[26px] font-sans font-medium leading-tight truncate">
                  {displayedName || 'Set your name'}
                </h1>
                <button
                  onClick={handleOpenNameEdit}
                  className="text-muted-foreground/50 hover:text-primary active:text-primary transition-colors shrink-0"
                  aria-label="Edit name"
                >
                  <Pencil size={14} />
                </button>
              </div>
            )}
            <p className="text-[15px] text-muted-foreground mt-0.5" data-testid="text-streak">
              {streakLabel(streak)}
            </p>
          </div>
        </header>

        {/* Ask Emmaus bar */}
        <AskEmmausBar />

        {/* ── Continue ───────────────────────────────────────────────────────── */}
        <Section title="Continue">
          {nextStepsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : continueItems.length === 0 ? (
            <div className="p-6 border border-dashed border-border rounded-2xl text-center">
              <p className="text-[14px] text-muted-foreground">
                Everything you're working through will appear here.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 rounded-xl"
                onClick={() => setLocation('/journeys')}
              >
                Discover something new
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {continueItems.map(item => (
                <ProgressRow
                  key={`${item.contentType}-${item.id}`}
                  item={item}
                  onOpen={() => setLocation(item.route)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── Completed ──────────────────────────────────────────────────────── */}
        {completedItems.length > 0 && (
          <Section title="Completed">
            <div className="space-y-2">
              {completedItems.map(item => (
                <ProgressRow
                  key={`${item.contentType}-${item.id}`}
                  item={item}
                  onOpen={() => setLocation(item.route)}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── ⭐ Favourites ────────────────────────────────────────────────────── */}
        <Section title="⭐ Favourites">
          {favsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : favourites.length === 0 ? (
            <div className="p-6 border border-dashed border-border rounded-2xl text-center">
              <p className="text-[14px] text-muted-foreground">
                Tap the ⭐ on any walk, verse, or sermon to save it here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {favourites.map(fav => (
                <FavouriteRow
                  key={fav.id}
                  fav={fav}
                  onOpen={() => setLocation(fav.content_route)}
                  onRefresh={loadData}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── History ────────────────────────────────────────────────────────── */}
        <Section title="History">
          {histLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : history.length === 0 ? (
            <div className="p-6 border border-dashed border-border rounded-2xl text-center">
              <p className="text-[14px] text-muted-foreground">
                Recently visited walks, sermons and Bible chapters will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 20).map(entry => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  onOpen={() => setLocation(entry.content_route)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* ── Prayer Requests ────────────────────────────────────────────────── */}
        <Section title="Prayer Requests">
          <Card className="bg-card border-border">
            <CardContent className="p-5 space-y-3">
              <Label htmlFor="prayer-input" className="sr-only">Prayer request</Label>
              <Textarea
                id="prayer-input"
                placeholder="What would you like prayer for today?"
                value={prayerRequest}
                onChange={(e) => setPrayerRequest(e.target.value)}
                className="resize-none bg-background border-border text-[16px] leading-relaxed rounded-xl min-h-[100px]"
                data-testid="input-prayer-request"
              />
              <Button
                size="sm"
                variant="secondary"
                className="w-full h-11 text-base rounded-xl"
                onClick={handleSavePrayer}
                data-testid="button-save-prayer"
              >
                Save Prayer Request
              </Button>
            </CardContent>
          </Card>
        </Section>

        {/* ── Saved Reflections ──────────────────────────────────────────────── */}
        {savedReflections.length > 0 && (
          <Section title="Saved Reflections">
            <div className="space-y-3">
              {savedReflections.map((r, i) => (
                <div key={i} className="p-4 rounded-xl border border-border bg-card space-y-2">
                  <h4 className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                    {r.title}
                  </h4>
                  <p className="text-[15px] text-foreground italic leading-relaxed">"{r.text}"</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── My Rooms ───────────────────────────────────────────────────────── */}
        <Section title="My Rooms">
          <div className="flex items-center justify-between -mt-1 mb-1">
            {roomUnread > 0 && (
              <span className="text-[11px] font-semibold text-primary">{roomUnread} new</span>
            )}
          </div>
          {myRooms.length === 0 ? (
            <div className="space-y-3">
              <p className="text-[14px] text-muted-foreground">
                You're not part of any Rooms yet.
              </p>
              <Button className="w-full h-11 rounded-xl text-[15px]" onClick={() => setLocation('/rooms/create')}>
                <Plus size={16} className="mr-2" />Create Room
              </Button>
              <Button variant="outline" className="w-full h-11 rounded-xl text-[15px]" onClick={() => setLocation('/rooms/join')}>
                <LogIn size={16} className="mr-2" />Join Room
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {myRooms.slice(0, 3).map(room => (
                <button
                  key={room.id}
                  onClick={() => setLocation(`/rooms/${room.id}`)}
                  className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Users size={15} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-foreground truncate">{room.name}</div>
                    <div className="text-[12px] text-muted-foreground">{room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}</div>
                  </div>
                  <ChevronRight size={15} className="text-muted-foreground shrink-0" />
                </button>
              ))}
              {myRooms.length > 3 && (
                <button
                  onClick={() => setLocation('/rooms')}
                  className="w-full text-center text-[13px] text-primary font-medium py-2 hover:underline"
                >
                  View all {myRooms.length} Rooms
                </button>
              )}
            </div>
          )}
        </Section>

        {/* ── Settings ───────────────────────────────────────────────────────── */}
        <Section title="Settings">
          <div className="p-4 rounded-xl border border-border bg-card flex justify-between items-center min-h-[56px]">
            <Label htmlFor="notifications-toggle" className="text-[16px] font-medium cursor-pointer">
              Daily Reminders
            </Label>
            <Switch
              id="notifications-toggle"
              checked={notifs}
              onCheckedChange={setNotifs}
              data-testid="toggle-notifications"
            />
          </div>
        </Section>

        {/* Sign Out */}
        <Button
          variant="ghost"
          className="w-full h-12 text-destructive hover:text-destructive flex gap-2 text-base"
          onClick={handleSignOut}
          data-testid="button-sign-out"
        >
          <LogOut size={17} aria-hidden="true" />
          Sign Out
        </Button>

      </main>
      <BottomNav />
    </div>
  );
}
