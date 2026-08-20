/**
 * Content Studio — publishing workspace for Emmaus content.
 *
 * Five top-level tabs (spec-locked):
 *   1. Daily Rhythm
 *   2. Daily Devotionals
 *   3. Journeys  (Journey Library | Collections subtabs)
 *   4. Sermons
 *   5. Media Studio  (YouTube Archive | Media Library subtabs)
 *
 * Navigation is internal state. Admin.tsx only knows the "content-studio" section.
 * All existing editors, list views and deep links are preserved; only the
 * information architecture and tab labels change.
 *
 * Journeys IA (2025 redesign):
 *   - Journey Library is the PRIMARY view — all journeys regardless of collection
 *   - Collections is a SECONDARY organisational view
 *   - No more "Standalone" tab — every journey is just a Journey
 */

import React, { useState } from 'react';
import {
  Sun, BookHeart, Map, Mic2,
  FolderOpen, BookOpen, Layers2,
  ChevronRight, X, Upload,
} from 'lucide-react';
import BulkImportModal from './BulkImportModal';

import DailyRhythmStudio from './DailyRhythmStudio';
import BibleContentStudio from './BibleContentStudio';
import DevotionalSeriesList from './DevotionalSeriesList';
import DevotionalSeriesEditor from './DevotionalSeriesEditor';
import DevotionalSeriesDetailView from './DevotionalSeriesDetailView';
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
import ContentGroupsList from './ContentGroupsList';
import ContentGroupEditor from './ContentGroupEditor';

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
  // ── Journeys — Library (primary entry point) ─────────────────────────────
  | { id: 'journeys-library' }
  // ── Journeys — Collections hierarchy (secondary organisational view) ──────
  | { id: 'journeys-collections' }
  | { id: 'collection-editor'; collectionId?: string }
  | { id: 'collection-detail'; collectionId: string; collectionTitle?: string }
  | { id: 'journey-detail'; journeyId: string; journeyTitle?: string; collectionId?: string; collectionTitle?: string }
  | { id: 'journey-day-editor'; journeyId: string; journeyTitle?: string; day: number | null; collectionId?: string; collectionTitle?: string; fromStandalone?: boolean }
  // ── Journeys — Standalone (used only for "new from collection" flow) ───────
  | { id: 'journeys-standalone'; openNew?: boolean; collectionId?: string }
  | { id: 'journey-editor'; journeyId: string; collectionId?: string; fromStandalone?: boolean; fromLibrary?: boolean }
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
  | { id: 'kit-editor'; kitId: string | null }
  // ── Bible Study ───────────────────────────────────────────────────────────
  | { id: 'bible-progress' }
  | { id: 'bible-generator'; bookId?: string }
  | { id: 'bible-book-intros' }
  // ── Groupings ─────────────────────────────────────────────────────────────
  | { id: 'groupings' }
  | { id: 'group-editor'; groupId?: string };

// ─── Top-level navigation ─────────────────────────────────────────────────────

type TopTab = { id: string; label: string; Icon: React.ElementType };

const TOP_NAV: TopTab[] = [
  { id: 'daily-rhythm', label: 'Daily Rhythm',      Icon: Sun       },
  { id: 'devotionals',  label: 'Daily Devotionals', Icon: BookHeart  },
  { id: 'walks',        label: 'Walks',             Icon: BookOpen   },
  { id: 'journeys',     label: 'Journeys',          Icon: FolderOpen },
  { id: 'groupings',    label: 'Groupings',         Icon: Layers2    },
  { id: 'sermons',      label: 'Sermons',           Icon: Mic2       },
];

// Map view.id → top-tab id
// Note: 'journey-editor' is computed dynamically (fromLibrary → 'walks', else → 'journeys')
const VIEW_TO_TAB: Partial<Record<StudioView['id'], string>> = {
  'daily-rhythm':               'daily-rhythm',
  'daily-rhythm-editor':        'daily-rhythm',
  'daily-rhythm-day-editor':    'daily-rhythm',
  'devotionals':                'devotionals',
  'devotional-editor':          'devotionals',
  'devotional-entry-editor':    'devotionals',
  // Walks tab — individual walk library and walk-level editors
  'journeys-library':           'walks',
  'journeys-standalone':        'walks',
  'legacy-journey-editor':      'walks',
  'legacy-day-editor':          'walks',
  'legacy-day-preview':         'walks',
  // Journeys tab — ordered collections of walks
  'journeys-collections':       'journeys',
  'collection-editor':          'journeys',
  'collection-detail':          'journeys',
  'journey-detail':             'journeys',
  'journey-day-editor':         'journeys',
  'sermons':                    'sermons',
  'sermon-editor':              'sermons',
  // Groupings tab
  'groupings':                  'groupings',
  'group-editor':               'groupings',
};

// Default view when a top tab is clicked
const TAB_DEFAULT_VIEW: Record<string, StudioView> = {
  'daily-rhythm': { id: 'daily-rhythm' },
  'devotionals':  { id: 'devotionals' },
  'walks':        { id: 'journeys-library' },
  'journeys':     { id: 'journeys-collections' },
  'sermons':      { id: 'sermons' },
  'groupings':    { id: 'groupings' },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialSubView?: string;
  initialJourneyId?: string;
  /** kept for API compat with Admin.tsx callers — unused */
  onOpenLegacyEditor?: (journeyId: string) => void;
}

export default function ContentStudio({ initialSubView, initialJourneyId }: Props) {
  // Side panels — show detail without leaving the list
  const [panelCollectionId, setPanelCollectionId] = useState<string | null>(null);
  const [panelSeriesId, setPanelSeriesId] = useState<string | null>(null);
  const [showBulkImport, setShowBulkImport] = useState(false);

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

  // journey-editor active tab depends on how it was opened
  const activeTabId = (() => {
    if (view.id === 'journey-editor') {
      return (view as { fromLibrary?: boolean }).fromLibrary ? 'walks' : 'journeys';
    }
    return VIEW_TO_TAB[view.id] ?? 'daily-rhythm';
  })();

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

      // Walks tab — flat library of individual walks
      case 'journeys-library':
        crumbs.push({ label: 'Walks' });
        break;

      // Journeys tab — ordered collections of walks
      case 'journeys-collections':
        crumbs.push({ label: 'Journeys' });
        break;
      case 'collection-editor':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
        crumbs.push({ label: view.collectionId ? 'Edit Journey' : 'New Journey' });
        break;
      case 'collection-detail':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
        crumbs.push({ label: view.collectionTitle ?? 'Journey' });
        break;
      case 'journey-detail':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
        if (view.collectionId) {
          crumbs.push({
            label: view.collectionTitle ?? 'Journey',
            onClick: () => navigate({ id: 'collection-detail', collectionId: view.collectionId!, collectionTitle: view.collectionTitle }),
          });
        }
        crumbs.push({ label: view.journeyTitle ?? 'Walk' });
        break;
      case 'journey-day-editor':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
        if (view.collectionId) {
          crumbs.push({
            label: view.collectionTitle ?? 'Journey',
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

      // Walks — new walk from collection context
      case 'journeys-standalone':
        crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
        crumbs.push({ label: view.collectionId ? 'Journey' : 'Walks' });
        break;
      case 'journey-editor':
        if (view.fromLibrary) {
          crumbs.push({ label: 'Walks', onClick: () => navigate({ id: 'journeys-library' }) });
        } else {
          crumbs.push({ label: 'Journeys', onClick: () => navigate({ id: 'journeys-collections' }) });
          if (view.fromStandalone) {
            crumbs.push({ label: 'Walks', onClick: () => navigate({ id: 'journeys-standalone' }) });
          }
        }
        crumbs.push({ label: 'Walk Editor' });
        break;

      // Legacy walk editors
      case 'legacy-journey-editor':
        crumbs.push({ label: 'Walks', onClick: () => navigate({ id: 'journeys-library' }) });
        crumbs.push({ label: 'Legacy Editor' });
        break;
      case 'legacy-day-editor':
        crumbs.push({ label: 'Walks', onClick: () => navigate({ id: 'journeys-library' }) });
        crumbs.push({ label: 'Legacy Editor', onClick: () => navigate({ id: 'legacy-journey-editor', journeyId: view.journeyId }) });
        crumbs.push({ label: 'Day Editor' });
        break;
      case 'legacy-day-preview':
        crumbs.push({ label: 'Walks', onClick: () => navigate({ id: 'journeys-library' }) });
        crumbs.push({ label: 'Preview' });
        break;

      // Sermons
      case 'sermons':
        crumbs.push({ label: 'Sermons' });
        break;
      case 'sermon-editor':
        crumbs.push({ label: 'Sermons', onClick: () => navigate({ id: 'sermons' }) });
        crumbs.push({ label: view.sermonId ? 'Review Sermon' : 'New Sermon' });
        break;

      // Groupings
      case 'groupings':
        crumbs.push({ label: 'Groupings' });
        break;
      case 'group-editor':
        crumbs.push({ label: 'Groupings', onClick: () => navigate({ id: 'groupings' }) });
        crumbs.push({ label: view.groupId ? 'Edit Group' : 'New Group' });
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

      // Bible Study
      case 'bible-progress':
        crumbs.push({ label: 'Bible Study' });
        crumbs.push({ label: 'Progress' });
        break;
      case 'bible-generator':
        crumbs.push({ label: 'Bible Study', onClick: () => navigate({ id: 'bible-progress' }) });
        crumbs.push({ label: 'Generator' });
        break;
      case 'bible-book-intros':
        crumbs.push({ label: 'Bible Study', onClick: () => navigate({ id: 'bible-progress' }) });
        crumbs.push({ label: 'Book Introductions' });
        break;
    }
    return crumbs;
  };

  // ── Subtab renderers ────────────────────────────────────────────────────────

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
            onEdit={(seriesId) => setPanelSeriesId(seriesId)}
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

      // ── Journeys — Library (primary flat list) ────────────────────────────
      case 'journeys-library':
        return (
          <StudioJourneyList
            onEdit={(id) => navigate({ id: 'journey-editor', journeyId: id, fromLibrary: true })}
            onLegacyEdit={(id) => navigate({ id: 'legacy-journey-editor', journeyId: id })}
          />
        );

      // ── Journeys — Collections ────────────────────────────────────────────
      case 'journeys-collections':
        return (
          <CollectionsList
            onNew={() => navigate({ id: 'collection-editor' })}
            onEdit={(id) => setPanelCollectionId(id)}
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
            onNewJourney={(collId) => navigate({ id: 'journeys-standalone', openNew: true, collectionId: collId })}
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
            // When opened from a collection context, show that collection's
            // journeys and pre-fill the collectionId in NewJourneyModal.
            // Without a collectionId, default to standalone-only view.
            collectionId={view.collectionId}
            standaloneOnly={!view.collectionId}
            autoOpenNew={view.openNew}
            onEdit={(id) => navigate({ id: 'journey-editor', journeyId: id, fromStandalone: !view.collectionId })}
            onLegacyEdit={(id) => navigate({ id: 'legacy-journey-editor', journeyId: id })}
          />
        );
      case 'journey-editor':
        return (
          <StudioJourneyEditor
            key={view.journeyId}
            journeyId={view.journeyId}
            onBack={() => navigate(
              view.fromLibrary   ? { id: 'journeys-library' } :
              view.fromStandalone ? { id: 'journeys-standalone' } : { id: 'journeys-collections' }
            )}
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

      // ── Sermons ───────────────────────────────────────────────────────────
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

      // ── Bible Study ───────────────────────────────────────────────────────
      case 'bible-progress':
        return (
          <BibleContentStudio
            initialSubView="progress"
          />
        );
      case 'bible-generator':
        return (
          <BibleContentStudio
            initialSubView="generator"
            initialBookId={(view as { bookId?: string }).bookId}
          />
        );
      case 'bible-book-intros':
        return (
          <BibleContentStudio
            initialSubView="book-intros"
          />
        );

      // ── Groupings ─────────────────────────────────────────────────────────
      case 'groupings':
        return (
          <ContentGroupsList
            onNew={() => navigate({ id: 'group-editor' })}
            onEdit={(groupId) => navigate({ id: 'group-editor', groupId })}
          />
        );
      case 'group-editor':
        return (
          <ContentGroupEditor
            groupId={view.groupId}
            onBack={() => navigate({ id: 'groupings' })}
            onSaved={() => navigate({ id: 'groupings' })}
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Top nav + subtabs + breadcrumb ────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">

        {/* Primary tab bar — 5 tabs + Bulk Import action */}
        <div
          className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1 px-3 sm:px-6 pt-3 sm:pt-4 pb-0"
          role="tablist"
          aria-label="Content Studio sections"
        >
          <div className="flex items-center gap-1 w-full flex-1 overflow-x-auto scrollbar-none">
            {TOP_NAV.map(({ id, label, Icon }) => {
              const active = activeTabId === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => navigate(TAB_DEFAULT_VIEW[id] ?? { id: 'daily-rhythm' })}
                  className={`flex-shrink-0 min-h-10 flex items-center gap-2 px-3 sm:px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
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

          {/* Bulk Import — always visible, right-aligned */}
          <button
            onClick={() => setShowBulkImport(true)}
            className="w-full sm:w-auto justify-center flex-shrink-0 flex items-center gap-1.5 sm:ml-3 sm:mb-1 min-h-10 px-3 py-1.5 text-[12px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors whitespace-nowrap"
          >
            <Upload size={12} />
            Bulk Import
          </button>
        </div>

        {/* Breadcrumb */}
        {crumbs.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none whitespace-nowrap px-3 sm:px-6 py-2 text-[12px] text-gray-500">
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

      {/* ── Devotional series side panel ─────────────────────────────────── */}
      {panelSeriesId && (
        <div className="fixed inset-0 z-40 flex pointer-events-none">
          {/* Backdrop */}
          <div
            className="flex-1 pointer-events-auto"
            onClick={() => setPanelSeriesId(null)}
          />
          {/* Drawer */}
          <div className="w-full sm:w-[520px] max-w-full bg-white border-l border-gray-200 shadow-2xl flex flex-col pointer-events-auto">
            {/* Panel chrome header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-gray-50">
              <span className="text-[13px] font-semibold text-gray-600 uppercase tracking-wide">Series Details</span>
              <button
                onClick={() => setPanelSeriesId(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                aria-label="Close panel"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <DevotionalSeriesDetailView
                key={panelSeriesId}
                seriesId={panelSeriesId}
                onBack={() => setPanelSeriesId(null)}
                onEditSeries={(id) => {
                  setPanelSeriesId(null);
                  navigate({ id: 'devotional-editor', seriesId: id });
                }}
                onNewEntry={(id) => {
                  setPanelSeriesId(null);
                  navigate({ id: 'devotional-editor', seriesId: id });
                }}
                onEditEntry={(id, day) => {
                  setPanelSeriesId(null);
                  navigate({ id: 'devotional-entry-editor', seriesId: id, day });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Journey detail side panel ─────────────────────────────────────── */}
      {panelCollectionId && (
        <div className="fixed inset-0 z-40 flex pointer-events-none">
          {/* Backdrop — closes panel on click */}
          <div
            className="flex-1 pointer-events-auto"
            onClick={() => setPanelCollectionId(null)}
          />
          {/* Drawer */}
          <div className="w-full sm:w-[520px] max-w-full bg-white border-l border-gray-200 shadow-2xl flex flex-col pointer-events-auto">
            {/* Panel chrome header */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-gray-50">
              <span className="text-[13px] font-semibold text-gray-600 uppercase tracking-wide">Journey Details</span>
              <button
                onClick={() => setPanelCollectionId(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
                aria-label="Close panel"
              >
                <X size={15} />
              </button>
            </div>
            {/* Reuse CollectionDetailView — walks list + metadata header */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <CollectionDetailView
                key={panelCollectionId}
                collectionId={panelCollectionId}
                onBack={() => setPanelCollectionId(null)}
                onNewJourney={(collId) => {
                  setPanelCollectionId(null);
                  navigate({ id: 'journeys-standalone', openNew: true, collectionId: collId });
                }}
                onOpenJourney={(journeyId, _journeyTitle, _collectionTitle) => {
                  setPanelCollectionId(null);
                  navigate({ id: 'journey-editor', journeyId, collectionId: panelCollectionId });
                }}
                onEditCollection={(collId) => {
                  setPanelCollectionId(null);
                  navigate({ id: 'collection-editor', collectionId: collId });
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Import modal ─────────────────────────────────────────────── */}
      {showBulkImport && (
        <BulkImportModal onClose={() => setShowBulkImport(false)} />
      )}
    </div>
  );
}
