/**
 * Content Studio — shell with internal sub-navigation.
 *
 * Sub-views: overview | collections | journeys | collection-editor | journey-editor
 * All navigation is internal state; the parent Admin.tsx only knows "content-studio" section.
 */

import React, { useState } from 'react';
import {
  LayoutGrid,
  FolderOpen,
  BookOpen,
  ChevronRight,
} from 'lucide-react';
import StudioOverview from './StudioOverview';
import CollectionsList from './CollectionsList';
import CollectionEditor from './CollectionEditor';
import StudioJourneyList from './StudioJourneyList';
import StudioJourneyEditor from './StudioJourneyEditor';

type StudioView =
  | { id: 'overview' }
  | { id: 'collections' }
  | { id: 'collection-editor'; collectionId?: string }
  | { id: 'journeys'; collectionId?: string; openNew?: boolean }
  | { id: 'journey-editor'; journeyId: string; collectionId?: string };

type NavItem = { id: string; label: string; Icon: React.ElementType };

const TOP_NAV: NavItem[] = [
  { id: 'overview',     label: 'Overview',     Icon: LayoutGrid },
  { id: 'collections',  label: 'Collections',  Icon: FolderOpen },
  { id: 'journeys',     label: 'All Journeys', Icon: BookOpen },
];

interface Props {
  initialSubView?: string;
  initialJourneyId?: string;
  onOpenLegacyEditor: (journeyId: string) => void;
}

export default function ContentStudio({ initialSubView, initialJourneyId, onOpenLegacyEditor }: Props) {
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

  const activeTopId =
    view.id === 'overview' ? 'overview' :
    view.id === 'collections' || view.id === 'collection-editor' ? 'collections' :
    'journeys';

  const renderBreadcrumb = () => {
    const crumbs: { label: string; onClick?: () => void }[] = [{ label: 'Content Studio' }];
    if (view.id === 'collections') crumbs.push({ label: 'Collections' });
    if (view.id === 'collection-editor') {
      crumbs.push({ label: 'Collections', onClick: () => navigate({ id: 'collections' }) });
      crumbs.push({ label: view.collectionId ? 'Edit Collection' : 'New Collection' });
    }
    if (view.id === 'journeys') {
      crumbs.push({ label: 'All Journeys' });
    }
    if (view.id === 'journey-editor') {
      crumbs.push({ label: 'All Journeys', onClick: () => navigate({ id: 'journeys' }) });
      crumbs.push({ label: 'Journey Editor' });
    }
    return crumbs;
  };

  const renderView = () => {
    switch (view.id) {
      case 'overview':
        return (
          <StudioOverview
            onNavigateCollections={() => navigate({ id: 'collections' })}
            onNavigateJourneys={() => navigate({ id: 'journeys' })}
            onOpenJourney={(id) => navigate({ id: 'journey-editor', journeyId: id })}
            onNewJourney={() => navigate({ id: 'journeys', openNew: true })}
          />
        );
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
      case 'journeys':
        return (
          <StudioJourneyList
            collectionId={view.collectionId}
            autoOpenNew={view.openNew}
            onEdit={(id) => navigate({ id: 'journey-editor', journeyId: id })}
            onLegacyEdit={onOpenLegacyEditor}
          />
        );
      case 'journey-editor':
        return (
          <StudioJourneyEditor
            key={view.journeyId}
            journeyId={view.journeyId}
            onBack={() => navigate({ id: 'journeys' })}
            onLegacyEditor={() => onOpenLegacyEditor(view.journeyId)}
          />
        );
    }
  };

  const crumbs = renderBreadcrumb();

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Studio top bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        {/* Top nav tabs */}
        <div className="flex items-center gap-1 px-6 pt-4 pb-0">
          {TOP_NAV.map(({ id, label, Icon }) => {
            const active = activeTopId === id;
            return (
              <button
                key={id}
                onClick={() => id !== 'journey-editor' && navigate({ id: id as Exclude<StudioView['id'], 'journey-editor' | 'collection-editor'> })}
                className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
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
      <div className="flex-1 overflow-y-auto">
        {renderView()}
      </div>
    </div>
  );
}
