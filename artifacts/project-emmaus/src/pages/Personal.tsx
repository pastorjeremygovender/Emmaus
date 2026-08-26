import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useAppearance, type AppearanceFontSize } from '@/contexts/AppearanceContext';
import { BottomNav } from '@/components/BottomNav';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';
import { SectionWrapper } from '@/components/SectionWrapper';
import { ShareEmmausButton } from '@/components/ShareEmmausButton';
import { FavouriteButton } from '@/components/FavouriteButton';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  LogOut, Pencil, Check, X, ChevronRight, Moon, Sun,
  Star, Clock, BookOpen, Headphones, Map, Users, ShieldCheck,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
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
  room:               'Group',
};

// ─── Section wrapper ──────────────────────────────────────────────────────────



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
    <div className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 hover:border-primary/25 transition-colors select-none">
      <div className="flex items-center gap-2 min-w-0">
        <button onClick={onOpen} className="flex-1 flex flex-col min-w-0 text-left">
          <p className="text-[14px] font-semibold text-foreground leading-snug truncate">
            {fav.content_title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {CONTENT_LABEL[fav.content_type] ?? fav.content_type}
          </p>
        </button>
        <FavouriteButton
          contentType={fav.content_type as Parameters<typeof FavouriteButton>[0]['contentType']}
          contentId={fav.content_id}
          contentTitle={fav.content_title}
          contentRoute={fav.content_route}
          className="shrink-0"
          size={15}
        />
      </div>
    </div>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ entry, onOpen }: { entry: HistoryEntry; onOpen: () => void }) {
  const Icon = CONTENT_ICON[entry.content_type] ?? BookOpen;
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-card rounded-xl border border-border/50 px-3.5 py-2.5 hover:border-primary/25 active:opacity-75 transition-colors select-none"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-foreground leading-snug truncate">
            {entry.content_title}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {historyTimeLabel(entry.viewed_at)}
          </p>
        </div>
        <ChevronRight size={15} className="shrink-0 text-muted-foreground/40" aria-hidden="true" />
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Personal() {
  const { user, signOut, updateName } = useAuth();
  const { progress, reflections, journeys } = useJourney();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { theme, fontSize, setTheme, setFontSize } = useAppearance();

  // ── Profile editing ────────────────────────────────────────────────────────
  const [notifs, setNotifs] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // ── Favourites ─────────────────────────────────────────────────────────────
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [favsLoading, setFavsLoading] = useState(true);

  // ── History ────────────────────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  const loadData = useCallback(async () => {
    setFavsLoading(true);
    setHistLoading(true);
    try {
      const [favs, hist] = await Promise.all([
        fetchFavourites(),
        fetchHistory(30),
      ]);
      setFavourites(favs);
      setHistory(hist);
    } catch { /* non-fatal */ }
    finally {
      setFavsLoading(false);
      setHistLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (!user) return null;

  // ── Derived ────────────────────────────────────────────────────────────────

  const coreJourneyId = '15-minutes-with-jesus';
  const coreProg = progress[coreJourneyId];
  const streak = coreProg ? coreProg.completedDays.length : 0;

  const savedReflections = Object.entries(reflections).map(([key, text]) => {
    const [jId, day] = key.split('-');
    const j = journeys.find((jx) => jx.id === jId);
    return { title: j ? `${j.title} — Day ${day}` : `Day ${day}`, text };
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSignOut = () => { signOut(); setLocation('/'); };

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
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-4">

        <div className="-mt-3 flex justify-end">
          <ShareEmmausButton />
        </div>

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

        {(user.role === 'admin' || user.role === 'superAdmin') && (
          <button
            type="button"
            onClick={() => setLocation('/admin')}
            className="w-full flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left text-primary hover:bg-primary/10 transition-colors"
          >
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <ShieldCheck size={16} aria-hidden="true" />
              Admin panel
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        )}

        {/* Unified Ask Emmaus / Search bar */}
        <UnifiedEmmausInput launchOnly className="mt-4" />

        {/* ── ⭐ Favourites ────────────────────────────────────────────────────── */}
        <SectionWrapper color="amber" label="Favourites">
          {favsLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-10 rounded-xl bg-amber-100/80 animate-pulse" />)}
            </div>
          ) : favourites.length === 0 ? (
            <p className="text-[13px] text-amber-700/70 text-center py-2">
              Tap the ⭐ on any walk, verse, or sermon to save it here.
            </p>
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
        </SectionWrapper>

        {/* ── History ────────────────────────────────────────────────────────── */}
        <SectionWrapper color="violet" label="History">
          {histLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-xl bg-violet-100/80 animate-pulse" />)}
            </div>
          ) : history.length === 0 ? (
            <p className="text-[13px] text-violet-700/70 text-center py-2">
              Recently visited walks, sermons and Bible chapters will appear here.
            </p>
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
        </SectionWrapper>

        {/* ── Saved Reflections ──────────────────────────────────────────────── */}
        {savedReflections.length > 0 && (
          <SectionWrapper color="emerald" label="Saved Reflections">
            <div className="space-y-2">
              {savedReflections.map((r, i) => (
                <div key={i} className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 space-y-1">
                  <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-widest">{r.title}</p>
                  <p className="text-[13px] text-foreground italic leading-relaxed">"{r.text}"</p>
                </div>
              ))}
            </div>
          </SectionWrapper>
        )}

        {/* ── Settings ───────────────────────────────────────────────────────── */}
        <SectionWrapper color="blue" label="Settings">
          <div className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 flex justify-between items-center">
            <Label htmlFor="notifications-toggle" className="text-[14px] font-semibold cursor-pointer">
              Daily Reminders
            </Label>
            <Switch
              id="notifications-toggle"
              checked={notifs}
              onCheckedChange={setNotifs}
              data-testid="toggle-notifications"
            />
          </div>
          <div className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              {theme === 'dark' ? <Moon size={17} className="text-primary" /> : <Sun size={17} className="text-amber-600" />}
              <div>
                <Label htmlFor="dark-mode-toggle" className="text-[14px] font-semibold cursor-pointer block">
                  Dark mode
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Use a darker, gentler colour palette</p>
              </div>
            </div>
            <Switch
              id="dark-mode-toggle"
              checked={theme === 'dark'}
              onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}
              data-testid="toggle-dark-mode"
            />
          </div>
          <div className="bg-card rounded-xl border border-border/50 px-3.5 py-3">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <div>
                <p className="text-[14px] font-semibold">Text size</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Make reading more comfortable</p>
              </div>
              <span className="text-xs text-muted-foreground" aria-live="polite">
                {fontSize === 'standard' ? 'Standard' : fontSize === 'large' ? 'Large' : 'Extra large'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Text size">
              {([
                ['standard', 'Standard', 'A'],
                ['large', 'Large', 'A+'],
                ['extra-large', 'Extra large', 'A++'],
              ] as [AppearanceFontSize, string, string][]).map(([value, label, sample]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={fontSize === value}
                  onClick={() => setFontSize(value)}
                  className={`rounded-lg border px-2 py-2 text-center transition-colors ${
                    fontSize === value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                  }`}
                >
                  <span className="block text-sm font-semibold">{sample}</span>
                  <span className="block text-[10px] mt-0.5">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </SectionWrapper>

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
