/**
 * Content Studio — complete publishing and discipleship content workspace.
 *
 * Tabs: Overview | Collections | Journeys | Sermons | YouTube Archive | Media
 *
 * All navigation is internal state; Admin.tsx only knows "content-studio" section.
 * Legacy journey editor is embedded here so Admin.tsx has no need of a standalone
 * 'journeys' section in the navigation.
 */

import React, { useState } from 'react';
import {
  LayoutGrid,
  FolderOpen,
  BookOpen,
  Video,
  Clapperboard,
  ImagePlay,
  ChevronRight,
  Sun,
  BookHeart,
} from 'lucide-react';

import StudioOverview from './StudioOverview';
import DailyRhythmStudio from './DailyRhythmStudio';
import DevotionalSeriesList from './DevotionalSeriesList';
import DevotionalSeriesEditor from './DevotionalSeriesEditor';
import DevotionalEntryEditor from './DevotionalEntryEditor';
import CollectionsList from './CollectionsList';
import CollectionEditor from './CollectionEditor';
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

type StudioView =
  | { id: 'overview' }
  | { id: 'collections' }
  | { id: 'collection-editor'; collectionId?: string }
  | { id: 'journeys'; collectionId?: string; openNew?: boolean }
  | { id: 'journey-editor'; journeyId: string; collectionId?: string }
  // Legacy journey editor (full-page, block-based)
  | { id: 'legacy-journey-editor'; journeyId?: string; freshlyGenerated?: boolean }
  | { id: 'legacy-day-editor'; journeyId: string; day?: number }
  | { id: 'legacy-day-preview'; journeyId: string; day: number }
  // Daily Rhythm
  | { id: 'daily-rhythm' }
  | { id: 'daily-rhythm-editor'; journeyId: string }
  | { id: 'daily-rhythm-day-editor'; journeyId: string; day: number | null }
  // Daily Devotionals
  | { id: 'devotionals' }
  | { id: 'devotional-editor'; seriesId: string }
  | { id: 'devotional-entry-editor'; seriesId: string; day: number }
  // Sermons
  | { id: 'sermons' }
  | { id: 'sermon-editor'; sermonId?: string | null }
  // YouTube Archive
  | { id: 'youtube-archive' }
  // Media Studio
  | { id: 'media' }
  | { id: 'kit-wizard' }
  | { id: 'kit-editor'; kitId: string | null };

type NavTab = { id: string; label: string; Icon: React.ElementType };

const TOP_NAV: NavTab[] = [
  { id: 'overview',       label: 'Overview',         Icon: LayoutGrid  },
  { id: 'collections',    label: 'Collections',      Icon: FolderOpen  },
  { id: 'daily-rhythm',   label: 'Daily Rhythm',     Icon: Sun         },
  { id: 'devotionals',    label: 'Devotionals',      Icon: BookHeart   },
  { id: 'journeys',       label: 'Journeys',         Icon: BookOpen    },
  { id: 'sermons',        label: 'Sermons',          Icon: Video       },
  { id: 'youtube-archive',label: 'YouTube Archive',  Icon: Clapperboard},
  { id: 'media',          label: 'Media',            Icon: ImagePlay   },
];

// Map each view.id to the tab that should appear active
const VIEW_TO_TAB: Partial<Record<StudioView['id'], string>> = {
  'overview':                   'overview',
  'collections':                'collections',
  'collection-editor':          'collections',
  'daily-rhythm':               'daily-rhythm',
  'daily-rhythm-editor':        'daily-rhythm',
  'daily-rhythm-day-editor':    'daily-rhythm',
  'devotionals':                'devotionals',
  'devotional-editor':          'devotionals',
  'devotional-entry-editor':    'devotionals',
  'journeys':                   'journeys',
  'journey-editor':             'journeys',
  'legacy-journey-editor':      'journeys',
  'legacy-day-editor':          'journeys',
  'legacy-day-preview':         'journeys',
  'sermons':                    'sermons',
  'sermon-editor':              'sermons',
  'youtube-archive':            'youtube-archive',
  'media':                      'media',
  'kit-wizard':                 'media',
  'kit-editor':                 'media',
};

// Navigate to the default view for a top-tab click
const TAB_DEFAULT_VIEW: Record<string, StudioView> = {
  overview:         { id: 'overview' },
  collections:      { id: 'collections' },
  'daily-rhythm':   { id: 'daily-rhythm' },
  devotionals:      { id: 'devotionals' },
  journeys:         { id: 'journeys' },
  sermons:          { id: 'sermons' },
  'youtube-archive':{ id: 'youtube-archive' },
  media:            { id: 'media' },
};

interface Props {
  initialSubView?: string;
  initialJourneyId?: string;
  onOpenLegacyEditor: (journeyId: string) => void;
}

export default function ContentStudio({ initialSubView, initialJourneyId }: Props) {
  const [view, setView] = useState<StudioView>(() => {
    if (initialSubView === 'studio-editor' && initialJourneyId) {
      return { id: 'journey-editor', journeyId: initialJourneyId };
    }
    return { id: 'overview' };
  });

  const navigate = (v: StudioView) => {
    setView(v);
    window.scrollTo(0, 0);
  };

  const activeTabId = VIEW_TO_TAB[view.id] ?? 'overview';

  // ─── Breadcrumb ─────────────────────────────────────────────────────────────

  const renderBreadcrumb = () => {
    const crumbs: { label: string; onClick?: () => void }[] = [{ label: 'Content Studio' }];
    if (view.id === 'collections')
      crumbs.push({ label: 'Collections' });
    if (view.id === 'collection-editor') {
      crumbs.push({ label: 'Collections', onClick: () => navigate({ id: 'collections' }) });
      crumbs.push({ label: view.collectionId ? 'Edit Collection' : 'New Collection' });
    }
    if (view.id === 'journeys')
      crumbs.push({ label: 'Journeys' });
    if (view.id === 'journey-editor') {
      crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys' }) });
      crumbs.push({ label: 'Journey Editor' });
    }
    if (view.id === 'legacy-journey-editor') {
      crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys' }) });
      crumbs.push({ label: 'Legacy Editor' });
    }
    if (view.id === 'legacy-day-editor') {
      crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys' }) });
      crumbs.push({ label: 'Legacy Editor', onClick: () => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId }) });
      crumbs.push({ label: 'Day Editor' });
    }
    if (view.id === 'legacy-day-preview') {
      crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys' }) });
      crumbs.push({ label: 'Preview' });
    }
    if (view.id === 'devotionals')
      crumbs.push({ label: 'Devotionals' });
    if (view.id === 'devotional-editor') {
      crumbs.push({ label: 'Devotionals', onClick: () => navigate({ id: 'devotionals' }) });
      crumbs.push({ label: 'Series' });
    }
    if (view.id === 'devotional-entry-editor') {
      crumbs.push({ label: 'Devotionals', onClick: () => navigate({ id: 'devotionals' }) });
      crumbs.push({ label: 'Series', onClick: () => navigate({ id: 'devotional-editor', seriesId: view.seriesId }) });
      crumbs.push({ label: `Day ${view.day}` });
    }
    if (view.id === 'daily-rhythm')
      crumbs.push({ label: 'Daily Rhythm' });
    if (view.id === 'daily-rhythm-editor') {
      crumbs.push({ label: 'Daily Rhythm', onClick: () => navigate({ id: 'daily-rhythm' }) });
      crumbs.push({ label: 'Edit Track' });
    }
    if (view.id === 'daily-rhythm-day-editor') {
      crumbs.push({ label: 'Daily Rhythm', onClick: () => navigate({ id: 'daily-rhythm' }) });
      crumbs.push({ label: view.day === null ? 'New Day' : `Day ${view.day}` });
    }
    if (view.id === 'sermons')
      crumbs.push({ label: 'Sermons' });
    if (view.id === 'sermon-editor') {
      crumbs.push({ label: 'Sermons', onClick: () => navigate({ id: 'sermons' }) });
      crumbs.push({ label: view.sermonId ? 'Edit Sermon' : 'New Sermon' });
    }
    if (view.id === 'youtube-archive')
      crumbs.push({ label: 'YouTube Archive' });
    if (view.id === 'media')
      crumbs.push({ label: 'Media' });
    if (view.id === 'kit-wizard') {
      crumbs.push({ label: 'Media', onClick: () => navigate({ id: 'media' }) });
      crumbs.push({ label: 'New Media Kit' });
    }
    if (view.id === 'kit-editor') {
      crumbs.push({ label: 'Media', onClick: () => navigate({ id: 'media' }) });
      crumbs.push({ label: 'Media Kit' });
    }
    return crumbs;
  };

  // ─── View renderer ──────────────────────────────────────────────────────────

  const renderView = () => {
    switch (view.id) {
      // ── Overview ──
      case 'overview':
        return (
          <StudioOverview
            onNavigateCollections={() => navigate({ id: 'collections' })}
            onNavigateJourneys={() => navigate({ id: 'journeys' })}
            onOpenJourney={(id) => navigate({ id: 'journey-editor', journeyId: id })}
            onNewJourney={() => navigate({ id: 'journeys', openNew: true })}
          />
        );
      // ── Collections ──
      case 'collections':
        return (
          <CollectionsList
            onNew={() => navigate({ id: 'collection-editor' })}
            onEdit={(id) => navigate({ id: 'collection-editor', collectionId: id })}
            onViewJourneys={(id) => navigate({ id: 'journeys', collectionId: id })}
          />
        );
      case 'collection-editor':
        return (
          <CollectionEditor
            collectionId={view.collectionId}
            onBack={() => navigate({ id: 'collections' })}
            onSaved={() => navigate({ id: 'collections' })}
          />
        );
      // ── Daily Devotionals ──
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
      // ── Daily Rhythm ──
      case 'daily-rhythm':
        return (
          <DailyRhythmStudio
            onNewDay={(id) => navigate({ id: 'daily-rhythm-day-editor', journeyId: id, day: null })}
            onEditDay={(id, day) => navigate({ id: 'daily-rhythm-day-editor', journeyId: id, day })}
          />
        );
      case 'daily-rhythm-editor':
        // Legacy block editor path — kept for back-compat
        return (
          <StudioJourneyEditor
            key={view.journeyId}
            journeyId={view.journeyId}
            onBack={() => navigate({ id: 'daily-rhythm' })}
            onLegacyEditor={() =>
              navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId })
            }
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
      // ── Journeys (block editor) ──
      case 'journeys':
        return (
          <StudioJourneyList
            collectionId={view.collectionId}
            autoOpenNew={view.openNew}
            onEdit={(id) => navigate({ id: 'journey-editor', journeyId: id })}
            onLegacyEdit={(id) => navigate({ id: 'legacy-journey-editor', journeyId: id })}
          />
        );
      case 'journey-editor':
        return (
          <StudioJourneyEditor
            key={view.journeyId}
            journeyId={view.journeyId}
            onBack={() => navigate({ id: 'journeys' })}
            onLegacyEditor={() => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId })}
          />
        );
      // ── Legacy Journey Editor ──
      case 'legacy-journey-editor':
        return (
          <JourneyEditor
            journeyId={view.journeyId ?? null}
            freshlyGenerated={view.freshlyGenerated}
            onBack={() => navigate({ id: 'journeys' })}
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
      // ── Sermons ──
      case 'sermons':
        return (
          <SermonsList
            onEdit={(id) => navigate({ id: 'sermon-editor', sermonId: id })}
            onNew={() => navigate({ id: 'sermon-editor', sermonId: null })}
            onOpenCompanion={(jId) => navigate({ id: 'legacy-journey-editor', journeyId: jId })}
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
      // ── YouTube Archive ──
      case 'youtube-archive':
        return <YoutubeArchive />;
      // ── Media Studio ──
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top nav + breadcrumb */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        {/* Tab bar */}
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
                onClick={() => navigate(TAB_DEFAULT_VIEW[id] ?? { id: 'overview' })}
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

      {/* Content area */}
      <div className="flex-1 overflow-y-auto" role="tabpanel">
        {renderView()}
      </div>
    </div>
  );
}
