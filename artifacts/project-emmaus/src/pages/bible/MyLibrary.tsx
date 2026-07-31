import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import {
  Search, Heart, Bookmark, FileText, HandIcon, Highlighter,
  ChevronRight, Trash2, Pencil, Check, X, BookOpen,
} from 'lucide-react';
import { useBible } from '@/contexts/BibleContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'notes' | 'prayers' | 'favourites' | 'bookmarks' | 'highlights';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BOOK_NAMES: Record<string, string> = {
  genesis: 'Genesis', exodus: 'Exodus', leviticus: 'Leviticus', numbers: 'Numbers',
  deuteronomy: 'Deuteronomy', joshua: 'Joshua', judges: 'Judges', ruth: 'Ruth',
  '1samuel': '1 Samuel', '2samuel': '2 Samuel', '1kings': '1 Kings', '2kings': '2 Kings',
  '1chronicles': '1 Chronicles', '2chronicles': '2 Chronicles', ezra: 'Ezra',
  nehemiah: 'Nehemiah', esther: 'Esther', job: 'Job', psalms: 'Psalms',
  proverbs: 'Proverbs', ecclesiastes: 'Ecclesiastes', songofsolomon: 'Song of Solomon',
  isaiah: 'Isaiah', jeremiah: 'Jeremiah', lamentations: 'Lamentations', ezekiel: 'Ezekiel',
  daniel: 'Daniel', hosea: 'Hosea', joel: 'Joel', amos: 'Amos', obadiah: 'Obadiah',
  jonah: 'Jonah', micah: 'Micah', nahum: 'Nahum', habakkuk: 'Habakkuk',
  zephaniah: 'Zephaniah', haggai: 'Haggai', zechariah: 'Zechariah', malachi: 'Malachi',
  matthew: 'Matthew', mark: 'Mark', luke: 'Luke', john: 'John', acts: 'Acts',
  romans: 'Romans', '1corinthians': '1 Corinthians', '2corinthians': '2 Corinthians',
  galatians: 'Galatians', ephesians: 'Ephesians', philippians: 'Philippians',
  colossians: 'Colossians', '1thessalonians': '1 Thessalonians', '2thessalonians': '2 Thessalonians',
  '1timothy': '1 Timothy', '2timothy': '2 Timothy', titus: 'Titus', philemon: 'Philemon',
  hebrews: 'Hebrews', james: 'James', '1peter': '1 Peter', '2peter': '2 Peter',
  '1john': '1 John', '2john': '2 John', '3john': '3 John', jude: 'Jude',
  revelation: 'Revelation',
};

function bookLabel(bookId: string) {
  return BOOK_NAMES[bookId] ?? bookId;
}

const HIGHLIGHT_COLORS: Record<string, { bg: string; label: string }> = {
  amber: { bg: 'bg-amber-200/70 dark:bg-amber-800/40', label: 'Amber' },
  blue:  { bg: 'bg-blue-200/70 dark:bg-blue-800/40',  label: 'Blue' },
  green: { bg: 'bg-green-200/70 dark:bg-green-800/40', label: 'Green' },
};

function matches(text: string, query: string) {
  return text.toLowerCase().includes(query.toLowerCase());
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ItemHeader({ icon, label, refText }: { icon: React.ReactNode; label: string; refText: string }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      {icon}
      <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">{refText}</span>
      <span className="ml-auto text-[11px] text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

function EditableText({
  initial,
  onSave,
  onCancel,
}: { initial: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        rows={4}
        className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-[14px] text-foreground resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 leading-relaxed"
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] text-muted-foreground hover:bg-muted transition-colors"
        >
          <X size={13} /> Cancel
        </button>
        <button
          onClick={() => onSave(value.trim())}
          disabled={!value.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Check size={13} /> Save
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function MyLibrary() {
  const [, setLocation] = useLocation();
  const {
    notes, saveNote, deleteNote,
    prayers, updatePrayer, deletePrayer,
    favourites, removeFavourite,
    bookmarks, removeBookmark,
    highlights, removeHighlight,
  } = useBible();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingPrayerId, setEditingPrayerId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const q = query.trim();

  // ── Filtered collections ────────────────────────────────────────────────────

  const filteredNotes = useMemo(() => {
    if (activeTab !== 'all' && activeTab !== 'notes') return [];
    if (!q) return notes;
    return notes.filter(n => matches(n.text, q) || matches(n.verseText, q) || matches(bookLabel(n.bookId), q));
  }, [notes, activeTab, q]);

  const filteredPrayers = useMemo(() => {
    if (activeTab !== 'all' && activeTab !== 'prayers') return [];
    if (!q) return prayers;
    return prayers.filter(p => matches(p.text, q) || matches(bookLabel(p.bookId), q));
  }, [prayers, activeTab, q]);

  const filteredFavourites = useMemo(() => {
    if (activeTab !== 'all' && activeTab !== 'favourites') return [];
    if (!q) return favourites;
    return favourites.filter(f =>
      matches(f.verseText, q) || matches(bookLabel(f.bookId), q) || matches(f.bookName, q),
    );
  }, [favourites, activeTab, q]);

  const filteredBookmarks = useMemo(() => {
    if (activeTab !== 'all' && activeTab !== 'bookmarks') return [];
    if (!q) return bookmarks;
    return bookmarks.filter(b =>
      matches(b.chapterHeading, q) || matches(bookLabel(b.bookId), q) || matches(b.bookName, q),
    );
  }, [bookmarks, activeTab, q]);

  const filteredHighlights = useMemo(() => {
    if (activeTab !== 'all' && activeTab !== 'highlights') return [];
    if (!q) return highlights;
    return highlights.filter(h =>
      matches(bookLabel(h.bookId), q) ||
      matches(`${bookLabel(h.bookId)} ${h.chapter}:${h.verse}`, q) ||
      matches(String(h.chapter), q) ||
      matches(HIGHLIGHT_COLORS[h.color]?.label ?? h.color, q),
    );
  }, [highlights, activeTab, q]);

  const totalCount = notes.length + prayers.length + favourites.length + bookmarks.length + highlights.length;
  const filteredCount = filteredNotes.length + filteredPrayers.length + filteredFavourites.length + filteredBookmarks.length + filteredHighlights.length;
  const hasResults = filteredCount > 0;

  // ── Tab config ──────────────────────────────────────────────────────────────

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: totalCount },
    { id: 'notes', label: 'Notes', count: notes.length },
    { id: 'prayers', label: 'Prayers', count: prayers.length },
    { id: 'favourites', label: 'Favourites', count: favourites.length },
    { id: 'bookmarks', label: 'Bookmarks', count: bookmarks.length },
    { id: 'highlights', label: 'Highlights', count: highlights.length },
  ];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function highlightText(text: string): React.ReactNode {
    if (!q) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx < 0) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-amber-200/70 dark:bg-amber-800/50 rounded-sm px-0.5 text-inherit">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  function handleDeleteConfirm(id: string, action: () => void) {
    if (confirmDeleteId === id) {
      action();
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
    }
  }

  return (
    <div className="space-y-5">

      {/* Search bar */}
      <div className="flex items-center gap-2 bg-muted/60 rounded-xl px-3.5 h-11">
        <Search size={15} className="text-muted-foreground shrink-0" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your annotations…"
          className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5 scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors whitespace-nowrap',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            ].join(' ')}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className={[
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                activeTab === tab.id ? 'bg-white/20 text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground',
              ].join(' ')}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {totalCount === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
            <BookOpen size={22} />
          </div>
          <div>
            <p className="text-[15px] font-medium text-foreground">Your library is empty</p>
            <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed max-w-[260px] mx-auto">
              Highlight verses, add notes, save favourites, or write prayers as you read.
            </p>
          </div>
        </div>
      )}

      {/* No search results */}
      {totalCount > 0 && !hasResults && q && (
        <div className="text-center py-12 space-y-1">
          <p className="text-[15px] text-muted-foreground">No results for "{q}"</p>
          <p className="text-[13px] text-muted-foreground">Try different words.</p>
        </div>
      )}

      {/* ── Notes ─────────────────────────────────────────────────────────────── */}
      {filteredNotes.length > 0 && (
        <section className="space-y-2.5">
          {(activeTab === 'all') && <LibrarySection icon={<FileText size={13} className="text-primary" />} label="Notes" />}
          {filteredNotes.map(note => (
            <div
              key={note.id}
              className="p-4 rounded-xl border border-border bg-card space-y-2"
            >
              <ItemHeader
                icon={<FileText size={12} className="text-primary shrink-0" />}
                refText={`${bookLabel(note.bookId)} ${note.chapter}:${note.verse}`}
                label="Note"
              />
              <p className="text-[12px] text-muted-foreground italic line-clamp-1 leading-relaxed">
                "{highlightText(note.verseText)}"
              </p>

              {editingNoteId === note.id ? (
                <EditableText
                  initial={note.text}
                  onSave={v => {
                    saveNote(note.bookId, note.chapter, note.verse, note.verseText, v);
                    setEditingNoteId(null);
                  }}
                  onCancel={() => setEditingNoteId(null)}
                />
              ) : (
                <p className="text-[14px] text-foreground leading-relaxed">
                  {highlightText(note.text)}
                </p>
              )}

              {editingNoteId !== note.id && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setLocation(`/bible/read/${note.bookId}/${note.chapter}`)}
                    className="flex items-center gap-1 text-[12px] text-primary hover:underline"
                  >
                    Open verse <ChevronRight size={12} />
                  </button>
                  <span className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => { setEditingNoteId(note.id); setConfirmDeleteId(null); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Edit note"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteConfirm(note.id, () => deleteNote(note.id))}
                      className={[
                        'flex items-center gap-1 p-1.5 rounded-lg transition-colors text-[12px]',
                        confirmDeleteId === note.id
                          ? 'bg-destructive/10 text-destructive font-medium px-2'
                          : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                      ].join(' ')}
                      aria-label="Delete note"
                    >
                      <Trash2 size={14} />
                      {confirmDeleteId === note.id && 'Delete?'}
                    </button>
                  </span>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── Prayers ──────────────────────────────────────────────────────────── */}
      {filteredPrayers.length > 0 && (
        <section className="space-y-2.5">
          {(activeTab === 'all') && <LibrarySection icon={<HandIcon size={13} className="text-primary" />} label="Prayers" />}
          {filteredPrayers.map(prayer => (
            <div
              key={prayer.id}
              className="p-4 rounded-xl border border-border bg-card space-y-2"
            >
              <ItemHeader
                icon={<HandIcon size={12} className="text-primary shrink-0" />}
                refText={`${bookLabel(prayer.bookId)} ${prayer.chapter}`}
                label="Prayer"
              />

              {editingPrayerId === prayer.id ? (
                <EditableText
                  initial={prayer.text}
                  onSave={v => {
                    updatePrayer(prayer.id, v);
                    setEditingPrayerId(null);
                  }}
                  onCancel={() => setEditingPrayerId(null)}
                />
              ) : (
                <p className="text-[14px] text-foreground leading-relaxed">
                  {highlightText(prayer.text)}
                </p>
              )}

              {editingPrayerId !== prayer.id && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setLocation(`/bible/read/${prayer.bookId}/${prayer.chapter}`)}
                    className="flex items-center gap-1 text-[12px] text-primary hover:underline"
                  >
                    Open chapter <ChevronRight size={12} />
                  </button>
                  <span className="ml-auto flex items-center gap-1.5">
                    <button
                      onClick={() => { setEditingPrayerId(prayer.id); setConfirmDeleteId(null); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Edit prayer"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteConfirm(prayer.id, () => deletePrayer(prayer.id))}
                      className={[
                        'flex items-center gap-1 p-1.5 rounded-lg transition-colors text-[12px]',
                        confirmDeleteId === prayer.id
                          ? 'bg-destructive/10 text-destructive font-medium px-2'
                          : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                      ].join(' ')}
                      aria-label="Delete prayer"
                    >
                      <Trash2 size={14} />
                      {confirmDeleteId === prayer.id && 'Delete?'}
                    </button>
                  </span>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* ── Favourites ────────────────────────────────────────────────────────── */}
      {filteredFavourites.length > 0 && (
        <section className="space-y-2.5">
          {(activeTab === 'all') && <LibrarySection icon={<Heart size={13} className="text-primary" />} label="Favourites" />}
          {filteredFavourites.map(fav => (
            <div
              key={fav.id}
              className="p-4 rounded-xl border border-border bg-card space-y-2"
            >
              <ItemHeader
                icon={<Heart size={12} className="text-primary fill-primary shrink-0" />}
                refText={`${fav.bookName} ${fav.chapter}:${fav.verse}`}
                label="Favourite"
              />
              <p className="text-[14px] font-sans leading-relaxed text-foreground italic">
                "{highlightText(fav.verseText)}"
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setLocation(`/bible/read/${fav.bookId}/${fav.chapter}`)}
                  className="flex items-center gap-1 text-[12px] text-primary hover:underline"
                >
                  Open verse <ChevronRight size={12} />
                </button>
                <button
                  onClick={() => handleDeleteConfirm(fav.id, () => removeFavourite(fav.bookId, fav.chapter, fav.verse))}
                  className={[
                    'ml-auto flex items-center gap-1 p-1.5 rounded-lg transition-colors text-[12px]',
                    confirmDeleteId === fav.id
                      ? 'bg-destructive/10 text-destructive font-medium px-2'
                      : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                  ].join(' ')}
                  aria-label="Remove favourite"
                >
                  <Trash2 size={14} />
                  {confirmDeleteId === fav.id && 'Remove?'}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Bookmarks ────────────────────────────────────────────────────────── */}
      {filteredBookmarks.length > 0 && (
        <section className="space-y-2.5">
          {(activeTab === 'all') && <LibrarySection icon={<Bookmark size={13} className="text-primary" />} label="Bookmarks" />}
          {filteredBookmarks.map(bkm => (
            <div
              key={bkm.id}
              className="p-4 rounded-xl border border-border bg-card space-y-1.5"
            >
              <ItemHeader
                icon={<Bookmark size={12} className="text-primary fill-primary shrink-0" />}
                refText={`${bkm.bookName} ${bkm.chapter}`}
                label="Bookmark"
              />
              <p className="text-[14px] font-medium text-foreground">
                {highlightText(bkm.chapterHeading)}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={() => setLocation(`/bible/read/${bkm.bookId}/${bkm.chapter}`)}
                  className="flex items-center gap-1 text-[12px] text-primary hover:underline"
                >
                  Open chapter <ChevronRight size={12} />
                </button>
                <button
                  onClick={() => handleDeleteConfirm(bkm.id, () => removeBookmark(bkm.bookId, bkm.chapter))}
                  className={[
                    'ml-auto flex items-center gap-1 p-1.5 rounded-lg transition-colors text-[12px]',
                    confirmDeleteId === bkm.id
                      ? 'bg-destructive/10 text-destructive font-medium px-2'
                      : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                  ].join(' ')}
                  aria-label="Remove bookmark"
                >
                  <Trash2 size={14} />
                  {confirmDeleteId === bkm.id && 'Remove?'}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ── Highlights ───────────────────────────────────────────────────────── */}
      {filteredHighlights.length > 0 && (
        <section className="space-y-2.5">
          {(activeTab === 'all') && <LibrarySection icon={<Highlighter size={13} className="text-primary" />} label="Highlights" />}
          {filteredHighlights.map((h, i) => {
            const colorInfo = HIGHLIGHT_COLORS[h.color] ?? HIGHLIGHT_COLORS.amber;
            const hKey = `${h.bookId}-${h.chapter}-${h.verse}`;
            return (
              <div
                key={`${hKey}-${i}`}
                className="p-4 rounded-xl border border-border bg-card"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={['inline-block w-3.5 h-3.5 rounded-full shrink-0', colorInfo.bg].join(' ')} />
                  <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                    {bookLabel(h.bookId)} {h.chapter}:{h.verse}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground font-medium">{colorInfo.label}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => setLocation(`/bible/read/${h.bookId}/${h.chapter}`)}
                    className="flex items-center gap-1 text-[12px] text-primary hover:underline"
                  >
                    Open verse <ChevronRight size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteConfirm(hKey, () => removeHighlight(h.bookId, h.chapter, h.verse))}
                    className={[
                      'ml-auto flex items-center gap-1 p-1.5 rounded-lg transition-colors text-[12px]',
                      confirmDeleteId === hKey
                        ? 'bg-destructive/10 text-destructive font-medium px-2'
                        : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10',
                    ].join(' ')}
                    aria-label="Remove highlight"
                  >
                    <Trash2 size={14} />
                    {confirmDeleteId === hKey && 'Remove?'}
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Bottom padding */}
      <div className="h-4" />
    </div>
  );
}

// ─── Section divider label ────────────────────────────────────────────────────

function LibrarySection({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {icon}
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
    </div>
  );
}
