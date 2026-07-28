/**
 * Content Studio — publishing workspace for Emmaus content.
 *
 * Five top-level tabs (spec-locked):
 *   1. Daily Rhythm
 *   2. Daily Devotionals
 *   3. Journeys  (Collections | Standalone subtabs)
 *   4. Sermon Companions
 *   5. Media Studio  (YouTube Archive | Media Library subtabs)
 *
 * Navigation is internal state. Admin.tsx only knows the "content-studio" section.
 * All existing editors, list views and deep links are preserved; only the
 * information architecture and tab labels change.
 */

import React, { useState } from 'react';
import {
  Sun, BookHeart, Map, Mic2, Film,
  FolderOpen, BookOpen, Clapperboard, ImagePlay,
  ChevronRight,
} from 'lucide-react';

import DailyRhythmStudio from './DailyRhythmStudio';
import DevotionalSeriesList from './DevotionalSeriesList';
import DevotionalSeriesEditor from './DevotionalSeriesEditor';
import DevotionalEntryEditor from './DevotionalEntryEditor';
import CollectionsList from './CollectionsList';
import CollectionEditor from './CollectionEditor';
import CollectionDetailView from './CollectionDetailView';
import JourneyDetailView from './JourneyDetailView';
import StudioJourneyList from './StudioJourneyList';
import StudioJourneyEditor from './StudioJourneyEditor';
import DailyRhythmDayEditor from './DailyRhythmDayEditor';
import SermonsList from '../SermonsList';
import SermonEditor from '../SermonEditor';
import YoutubeArchive from '../YoutubeArchive';
import MediaStudioDashboard from '../media-studio/MediaStudioDashboard';
import MediaKitWizard from '../media-studio/MediaKitWizard';
import MediaKitEditor from '../media-studio/MediaKitEditor';
import JourneyEditor from '../JourneyEditor';
import DayEditor from '../DayEditor';
import DayPreview from '../DayPreview';

// ─── View types ───────────────────────────────────────────────────────────────

type StudioView =
  // ── Daily Rhythm ──────────────────────────────────────────────────────────
  | { id: 'daily-rhythm' }
  | { id: 'daily-rhythm-editor'; journeyId: string }
  | { id: 'daily-rhythm-day-editor'; journeyId: string; day: number | null }
  // ── Daily Devotionals ─────────────────────────────────────────────────────
  | { id: 'devotionals' }
  | { id: 'devotional-editor'; seriesId: string }
  | { id: 'devotional-entry-editor'; seriesId: string; day: number }
  // ── Journeys — Collections hierarchy ─────────────────────────────────────
  | { id: 'journeys-collections' }
  | { id: 'collection-editor'; collectionId?: string }
  | { id: 'collection-detail'; collectionId: string; collectionTitle?: string }
  | { id: 'journey-detail'; journeyId: string; journeyTitle?: string; collectionId?: string; collectionTitle?: string }
  | { id: 'journey-day-editor'; journeyId: string; journeyTitle?: string; day: number | null; collectionId?: string; collectionTitle?: string; fromStandalone?: boolean }
  // ── Journeys — Standalone ─────────────────────────────────────────────────
  | { id: 'journeys-standalone'; openNew?: boolean }
  | { id: 'journey-editor'; journeyId: string; collectionId?: string; fromStandalone?: boolean }
  // ── Legacy journey editors (preserve deep links) ──────────────────────────
  | { id: 'legacy-journey-editor'; journeyId?: string; freshlyGenerated?: boolean }
  | { id: 'legacy-day-editor'; journeyId: string; day?: number }
  | { id: 'legacy-day-preview'; journeyId: string; day: number }
  // ── Sermon Companions ─────────────────────────────────────────────────────
  | { id: 'sermons' }
  | { id: 'sermon-editor'; sermonId?: string | null }
  // ── Media Studio ──────────────────────────────────────────────────────────
  | { id: 'youtube-archive' }
  | { id: 'media' }
  | { id: 'kit-wizard' }
  | { id: 'kit-editor'; kitId: string | null };

// ─── Top-level navigation ─────────────────────────────────────────────────────

type TopTab = { id: string; label: string; Icon: React.ElementType };

const TOP_NAV: TopTab[] = [
  { id: 'daily-rhythm',    label: 'Daily Rhythm',      Icon: Sun      },
  { id: 'devotionals',     label: 'Daily Devotionals', Icon: BookHeart },
  { id: 'journeys',        label: 'Journeys',          Icon: Map       },
  { id: 'sermons',         label: 'Sermon Companions', Icon: Mic2      },
  { id: 'media-studio',    label: 'Media Studio',      Icon: Film      },
];

// Map view.id → top-tab id
const VIEW_TO_TAB: Partial<Record<StudioView['id'], string>> = {
  'daily-rhythm':               'daily-rhythm',
  'daily-rhythm-editor':        'daily-rhythm',
  'daily-rhythm-day-editor':    'daily-rhythm',
  'devotionals':                'devotionals',
  'devotional-editor':          'devotionals',
  'devotional-entry-editor':    'devotionals',
  'journeys-collections':       'journeys',
  'collection-editor':          'journeys',
  'collection-detail':          'journeys',
  'journey-detail':             'journeys',
  'journey-day-editor':         'journeys',
  'journeys-standalone':        'journeys',
  'journey-editor':             'journeys',
  'legacy-journey-editor':      'journeys',
  'legacy-day-editor':          'journeys',
  'legacy-day-preview':         'journeys',
  'sermons':                    'sermons',
  'sermon-editor':              'sermons',
  'youtube-archive':            'media-studio',
  'media':                      'media-studio',
  'kit-wizard':                 'media-studio',
  'kit-editor':                 'media-studio',
};

// Default view when a top tab is clicked
const TAB_DEFAULT_VIEW: Record<string, StudioView> = {
  'daily-rhythm':  { id: 'daily-rhythm' },
  'devotionals':   { id: 'devotionals' },
  'journeys':      { id: 'journeys-collections' },
  'sermons':       { id: 'sermons' },
  'media-studio':  { id: 'youtube-archive' },
};

// ─── Subtab helpers ───────────────────────────────────────────────────────────

type JourneysSubTab = 'collections' | 'standalone';
type MediaSubTab    = 'youtube' | 'library';

function getJourneysSubTab(view: StudioView): JourneysSubTab {
  const standaloneIds: StudioView['id'][] = ['journeys-standalone'];
  if (standaloneIds.includes(view.id)) return 'standalone';
  if (
    (view.id === 'journey-editor'   && (view as { fromStandalone?: boolean }).fromStandalone) ||
    (view.id === 'journey-day-editor' && (view as { fromStandalone?: boolean }).fromStandalone)
  ) return 'standalone';
  return 'collections';
}

function getMediaSubTab(view: StudioView): MediaSubTab {
  return view.id === 'youtube-archive' ? 'youtube' : 'library';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialSubView?: string;
  initialJourneyId?: string;
  /** kept for API compat with Admin.tsx callers — unused */
  onOpenLegacyEditor?: (journeyId: string) => void;
}

export default function ContentStudio({ initialSubView, initialJourneyId }: Props) {
  const [view, setView] = useState<StudioView>(() => {
    if (initialSubView === 'studio-editor' && initialJourneyId) {
      return { id: 'journey-editor', journeyId: initialJourneyId };
    }
    // Legacy: old 'overview' default → land on Daily Rhythm
    return { id: 'daily-rhythm' };
  });

  const navigate = (v: StudioView) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  const activeTabId = VIEW_TO_TAB[view.id] ?? 'daily-rhythm';

  // ── Breadcrumb ──────────────────────────────────────────────────────────────

  const renderBreadcrumb = () => {
    const crumbs: { label: string; onClick?: () => void }[] = [
      { label: 'Content Studio' },
    ];

    switch (view.id) {
      // Daily Rhythm
      case 'daily-rhythm':
        crumbs.push({ label: 'Daily Rhythm' });
        break;
      case 'daily-rhythm-editor':
        crumbs.push({ label: 'Daily Rhythm', onClick: () => navigate({ id: 'daily-rhythm' }) });
        crumbs.push({ label: 'Edit Track' });
        break;
      case 'daily-rhythm-day-editor':
        crumbs.push({ label: 'Daily Rhythm', onClick: () => navigate({ id: 'daily-rhythm' }) });
        crumbs.push({ label: view.day === null ? 'New Day' : `Day ${view.day}` });
        break;

      // Daily Devotionals
      case 'devotionals':
        crumbs.push({ label: 'Daily Devotionals' });
        break;
      case 'devotional-editor':
        crumbs.push({ label: 'Daily Devotionals', onClick: () => navigate({ id: 'devotionals' }) });
        crumbs.push({ label: 'Series' });
        break;
      case 'devotional-entry-editor':
        crumbs.push({ label: 'Daily Devotionals', onClick: () => navigate({ id: 'devotionals' }) });
        crumbs.push({ label: 'Series', onClick: () => navigate({ id: 'devotional-editor', seriesId: view.seriesId }) });
        crumbs.push({ label: `Day ${view.day}` });
        break;

      // Journeys — Collections
      case 'journeys-collections':
        crumbs.push({ label: 'Journeys' });
        crumbs.push({ label: 'Collections' });
        break;
      case 'collection-editor':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
        crumbs.push({ label: 'Collections', onClick: () => navigate({ id: 'journeys-collections' }) });
        crumbs.push({ label: view.collectionId ? 'Edit Collection' : 'New Collection' });
        break;
      case 'collection-detail':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
        crumbs.push({ label: 'Collections', onClick: () => navigate({ id: 'journeys-collections' }) });
        crumbs.push({ label: view.collectionTitle ?? 'Collection' });
        break;
      case 'journey-detail':
        crumbs.push({
          label: 'Journeys',
          onClick: () => navigate(view.collectionId ? { id: 'journeys-collections' } : { id: 'journeys-standalone' }),
        });
        if (view.collectionId) {
          crumbs.push({
            label: view.collectionTitle ?? 'Collection',
            onClick: () => navigate({ id: 'collection-detail', collectionId: view.collectionId!, collectionTitle: view.collectionTitle }),
          });
        } else {
          crumbs.push({ label: 'Standalone', onClick: () => navigate({ id: 'journeys-standalone' }) });
        }
        crumbs.push({ label: view.journeyTitle ?? 'Journey' });
        break;
      case 'journey-day-editor':
        crumbs.push({
          label: 'Journeys',
          onClick: () => navigate(view.fromStandalone ? { id: 'journeys-standalone' } : { id: 'journeys-collections' }),
        });
        if (view.collectionId) {
          crumbs.push({
            label: view.collectionTitle ?? 'Collection',
            onClick: () => navigate({ id: 'collection-detail', collectionId: view.collectionId!, collectionTitle: view.collectionTitle }),
          });
        }
        crumbs.push({
          label: view.journeyTitle ?? 'Journey',
          onClick: () => navigate({
            id: 'journey-detail',
            journeyId: view.journeyId,
            journeyTitle: view.journeyTitle,
            collectionId: view.collectionId,
            collectionTitle: view.collectionTitle,
          }),
        });
        crumbs.push({ label: view.day === null ? 'New Day' : `Day ${view.day}` });
        break;

      // Journeys — Standalone
      case 'journeys-standalone':
        crumbs.push({ label: 'Journeys' });
        crumbs.push({ label: 'Standalone' });
        break;
      case 'journey-editor':
        crumbs.push({ label: 'Journeys', onClick: () => navigate(view.fromStandalone ? { id: 'journeys-standalone' } : { id: 'journeys-collections' }) });
        crumbs.push({ label: view.fromStandalone ? 'Standalone' : 'Collections', onClick: () => navigate(view.fromStandalone ? { id: 'journeys-standalone' } : { id: 'journeys-collections' }) });
        crumbs.push({ label: 'Journey Editor' });
        break;

      // Legacy editors
      case 'legacy-journey-editor':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-standalone' }) });
        crumbs.push({ label: 'Legacy Editor' });
        break;
      case 'legacy-day-editor':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-standalone' }) });
        crumbs.push({ label: 'Legacy Editor', onClick: () => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId }) });
        crumbs.push({ label: 'Day Editor' });
        break;
      case 'legacy-day-preview':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-standalone' }) });
        crumbs.push({ label: 'Preview' });
        break;

      // Sermon Companions
      case 'sermons':
        crumbs.push({ label: 'Sermon Companions' });
        break;
      case 'sermon-editor':
        crumbs.push({ label: 'Sermon Companions', onClick: () => navigate({ id: 'sermons' }) });
        crumbs.push({ label: view.sermonId ? 'Edit Companion' : 'New Sermon Companion' });
        break;

      // Media Studio
      case 'youtube-archive':
        crumbs.push({ label: 'Media Studio' });
        crumbs.push({ label: 'YouTube Archive' });
        break;
      case 'media':
        crumbs.push({ label: 'Media Studio' });
        crumbs.push({ label: 'Media Library' });
        break;
      case 'kit-wizard':
        crumbs.push({ label: 'Media Studio', onClick: () => navigate({ id: 'media' }) });
        crumbs.push({ label: 'Media Library', onClick: () => navigate({ id: 'media' }) });
        crumbs.push({ label: 'New Media Kit' });
        break;
      case 'kit-editor':
        crumbs.push({ label: 'Media Studio', onClick: () => navigate({ id: 'media' }) });
        crumbs.push({ label: 'Media Library', onClick: () => navigate({ id: 'media' }) });
        crumbs.push({ label: 'Media Kit' });
        break;
    }
    return crumbs;
  };

  // ── Subtab renderers ────────────────────────────────────────────────────────

  function renderJourneysSubTabs() {
    const sub = getJourneysSubTab(view);
    const tabs: { id: JourneysSubTab; label: string; Icon: React.ElementType }[] = [
      { id: 'collections', label: 'Collections', Icon: FolderOpen },
      { id: 'standalone',  label: 'Standalone',  Icon: BookOpen   },
    ];
    return (
      <div className="flex items-center gap-4 px-6 pt-2 pb-2 border-b border-gray-100 bg-gray-50">
        {tabs.map(({ id, label, Icon }) => {
          const active = sub === id;
          return (
            <button
              key={id}
              onClick={() => navigate(id === 'collections' ? { id: 'journeys-collections' } : { id: 'journeys-standalone' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                active
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  function renderMediaSubTabs() {
    const sub = getMediaSubTab(view);
    const tabs: { id: MediaSubTab; label: string; Icon: React.ElementType }[] = [
      { id: 'youtube',  label: 'YouTube Archive', Icon: Clapperboard },
      { id: 'library',  label: 'Media Library',   Icon: ImagePlay    },
    ];
    return (
      <div className="flex items-center gap-4 px-6 pt-2 pb-2 border-b border-gray-100 bg-gray-50">
        {tabs.map(({ id, label, Icon }) => {
          const active = sub === id;
          return (
            <button
              key={id}
              onClick={() => navigate(id === 'youtube' ? { id: 'youtube-archive' } : { id: 'media' })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                active
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  // ── View renderer ────────────────────────────────────────────────────────────

  const renderView = () => {
    switch (view.id) {
      // ── Daily Rhythm ──────────────────────────────────────────────────────
      case 'daily-rhythm':
        return (
          <DailyRhythmStudio
            onNewDay={(id) => navigate({ id: 'daily-rhythm-day-editor', journeyId: id, day: null })}
            onEditDay={(id, day) => navigate({ id: 'daily-rhythm-day-editor', journeyId: id, day })}
          />
        );
      case 'daily-rhythm-editor':
        return (
          <StudioJourneyEditor
            key={view.journeyId}
            journeyId={view.journeyId}
            onBack={() => navigate({ id: 'daily-rhythm' })}
            onLegacyEditor={() => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId })}
          />
        );
      case 'daily-rhythm-day-editor':
        return (
          <DailyRhythmDayEditor
            key={`${view.journeyId}-${view.day}`}
            journeyId={view.journeyId}
            day={view.day}
            onBack={() => navigate({ id: 'daily-rhythm' })}
            onDuplicated={(newDay) => navigate({ id: 'daily-rhythm-day-editor', journeyId: view.journeyId, day: newDay })}
            onDeleted={() => navigate({ id: 'daily-rhythm' })}
          />
        );

      // ── Daily Devotionals ─────────────────────────────────────────────────
      case 'devotionals':
        return (
          <DevotionalSeriesList
            onEdit={(seriesId) => navigate({ id: 'devotional-editor', seriesId })}
          />
        );
      case 'devotional-editor':
        return (
          <DevotionalSeriesEditor
            key={view.seriesId}
            seriesId={view.seriesId}
            onBack={() => navigate({ id: 'devotionals' })}
            onEditEntry={(seriesId, day) => navigate({ id: 'devotional-entry-editor', seriesId, day })}
          />
        );
      case 'devotional-entry-editor':
        return (
          <DevotionalEntryEditor
            key={`${view.seriesId}-${view.day}`}
            seriesId={view.seriesId}
            day={view.day}
            onBack={() => navigate({ id: 'devotional-editor', seriesId: view.seriesId })}
          />
        );

      // ── Journeys — Collections ────────────────────────────────────────────
      case 'journeys-collections':
        return (
          <CollectionsList
            onNew={() => navigate({ id: 'collection-editor' })}
            onEdit={(id) => navigate({ id: 'collection-editor', collectionId: id })}
            onViewJourneys={(id, title) => navigate({ id: 'collection-detail', collectionId: id, collectionTitle: title })}
          />
        );
      case 'collection-editor':
        return (
          <CollectionEditor
            collectionId={view.collectionId}
            onBack={() => navigate({ id: 'journeys-collections' })}
            onSaved={() => navigate({ id: 'journeys-collections' })}
          />
        );
      case 'collection-detail':
        return (
          <CollectionDetailView
            collectionId={view.collectionId}
            onBack={() => navigate({ id: 'journeys-collections' })}
            onNewJourney={(collId) => navigate({ id: 'journeys-standalone', openNew: true })}
            onOpenJourney={(journeyId, journeyTitle, collectionTitle) =>
              navigate({ id: 'journey-detail', journeyId, journeyTitle, collectionId: view.collectionId, collectionTitle })
            }
            onEditCollection={(collId) => navigate({ id: 'collection-editor', collectionId: collId })}
          />
        );
      case 'journey-detail':
        return (
          <JourneyDetailView
            journeyId={view.journeyId}
            onBack={() =>
              view.collectionId
                ? navigate({ id: 'collection-detail', collectionId: view.collectionId, collectionTitle: view.collectionTitle })
                : navigate({ id: 'journeys-standalone' })
            }
            onEditJourney={(jId) => navigate({ id: 'journey-editor', journeyId: jId, collectionId: view.collectionId, fromStandalone: !view.collectionId })}
            onAddDay={(jId) =>
              navigate({ id: 'journey-day-editor', journeyId: jId, journeyTitle: view.journeyTitle, day: null, collectionId: view.collectionId, collectionTitle: view.collectionTitle })
            }
            onEditDay={(jId, day) =>
              navigate({ id: 'journey-day-editor', journeyId: jId, journeyTitle: view.journeyTitle, day, collectionId: view.collectionId, collectionTitle: view.collectionTitle })
            }
          />
        );
      case 'journey-day-editor':
        return (
          <DailyRhythmDayEditor
            key={`${view.journeyId}-${view.day}`}
            journeyId={view.journeyId}
            day={view.day}
            variant="journey"
            onBack={() => navigate({ id: 'journey-detail', journeyId: view.journeyId, journeyTitle: view.journeyTitle, collectionId: view.collectionId, collectionTitle: view.collectionTitle })}
            onDuplicated={(newDay) =>
              navigate({ id: 'journey-day-editor', journeyId: view.journeyId, journeyTitle: view.journeyTitle, day: newDay, collectionId: view.collectionId, collectionTitle: view.collectionTitle })
            }
            onDeleted={() => navigate({ id: 'journey-detail', journeyId: view.journeyId, journeyTitle: view.journeyTitle, collectionId: view.collectionId, collectionTitle: view.collectionTitle })}
          />
        );

      // ── Journeys — Standalone ─────────────────────────────────────────────
      case 'journeys-standalone':
        return (
          <StudioJourneyList
            standaloneOnly
            autoOpenNew={view.openNew}
            onEdit={(id) => navigate({ id: 'journey-editor', journeyId: id, fromStandalone: true })}
            onLegacyEdit={(id) => navigate({ id: 'legacy-journey-editor', journeyId: id })}
          />
        );
      case 'journey-editor':
        return (
          <StudioJourneyEditor
            key={view.journeyId}
            journeyId={view.journeyId}
            onBack={() => navigate(view.fromStandalone ? { id: 'journeys-standalone' } : { id: 'journeys-collections' })}
            onLegacyEditor={() => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId })}
          />
        );

      // ── Legacy Journey Editors (preserve deep links) ──────────────────────
      case 'legacy-journey-editor':
        return (
          <JourneyEditor
            journeyId={view.journeyId ?? null}
            freshlyGenerated={view.freshlyGenerated}
            onBack={() => navigate({ id: 'journeys-standalone' })}
            onEditDay={(jId, d) => navigate({ id: 'legacy-day-editor', journeyId: jId, day: d })}
            onPreviewDay={(jId, d) => navigate({ id: 'legacy-day-preview', journeyId: jId, day: d })}
          />
        );
      case 'legacy-day-editor':
        return (
          <DayEditor
            journeyId={view.journeyId}
            day={view.day ?? null}
            onBack={() => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId })}
          />
        );
      case 'legacy-day-preview':
        return (
          <DayPreview
            journeyId={view.journeyId}
            day={view.day}
            onBack={() => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId })}
          />
        );

      // ── Sermon Companions ─────────────────────────────────────────────────
      case 'sermons':
        return (
          <SermonsList
            onEdit={(id) => navigate({ id: 'sermon-editor', sermonId: id })}
            onNew={() => navigate({ id: 'sermon-editor', sermonId: null })}
            onOpenCompanion={(sermonId, companionId) => {
              const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companionId);
              if (isUUID) {
                navigate({ id: 'sermon-editor', sermonId });
              } else {
                navigate({ id: 'legacy-journey-editor', journeyId: companionId });
              }
            }}
          />
        );
      case 'sermon-editor':
        return (
          <SermonEditor
            sermonId={view.sermonId ?? null}
            onBack={() => navigate({ id: 'sermons' })}
            onOpenCompanion={(jId, fresh) =>
              navigate({ id: 'legacy-journey-editor', journeyId: jId, freshlyGenerated: fresh })
            }
          />
        );

      // ── Media Studio — YouTube Archive ────────────────────────────────────
      case 'youtube-archive':
        return <YoutubeArchive />;

      // ── Media Studio — Media Library ──────────────────────────────────────
      case 'media':
        return (
          <MediaStudioDashboard
            onCreateKit={() => navigate({ id: 'kit-wizard' })}
            onOpenKit={(kitId) => navigate({ id: 'kit-editor', kitId })}
          />
        );
      case 'kit-wizard':
        return (
          <MediaKitWizard
            onBack={() => navigate({ id: 'media' })}
            onCreated={(kitId) => navigate({ id: 'kit-editor', kitId })}
          />
        );
      case 'kit-editor':
        return (
          <MediaKitEditor
            kitId={view.kitId}
            onBack={() => navigate({ id: 'media' })}
          />
        );
    }
  };

  const crumbs = renderBreadcrumb();
  const showJourneysSubTabs  = activeTabId === 'journeys'      && !['journey-editor', 'journey-day-editor', 'journey-detail', 'collection-editor', 'collection-detail', 'legacy-journey-editor', 'legacy-day-editor', 'legacy-day-preview'].includes(view.id);
  const showMediaSubTabs     = activeTabId === 'media-studio'  && !['kit-wizard', 'kit-editor'].includes(view.id);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Top nav + subtabs + breadcrumb ────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">

        {/* Primary tab bar — 5 tabs */}
        <div
          className="flex items-center gap-1 px-6 pt-4 pb-0 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="Content Studio sections"
        >
          {TOP_NAV.map(({ id, label, Icon }) => {
            const active = activeTabId === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => navigate(TAB_DEFAULT_VIEW[id] ?? { id: 'daily-rhythm' })}
                className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                  active
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>

        {/* Journeys subtabs */}
        {showJourneysSubTabs && renderJourneysSubTabs()}

        {/* Media Studio subtabs */}
        {showMediaSubTabs && renderMediaSubTabs()}

        {/* Breadcrumb */}
        {crumbs.length > 1 && (
          <div className="flex items-center gap-1.5 px-6 py-2 text-[12px] text-gray-500">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                {i > 0 && <ChevronRight size={12} className="text-gray-300" />}
                {c.onClick ? (
                  <button onClick={c.onClick} className="hover:text-teal-600 transition-colors">
                    {c.label}
                  </button>
                ) : (
                  <span className={i === crumbs.length - 1 ? 'text-gray-700 font-medium' : ''}>
                    {c.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* ── Content area ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" role="tabpanel">
        {renderView()}
      </div>
    </div>
  );
}
