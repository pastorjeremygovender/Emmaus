import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  Plus, Search, BookOpen, Layers, X,
  Heart, GraduationCap, Tag, MoreHorizontal,
  Archive, Copy, Download, Trash2, FolderOpen,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import type { Journey } from '@/lib/journeys-api';
import { listCollections } from '@/lib/collections-api';
import { StatusBadge } from '../shared';
import ContentStudioListItem from './ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, menuBtnCls, newBtnCls } from './ContentStudioListPage';
import NewJourneyModal from './NewJourneyModal';
import DeleteJourneyDialog from './DeleteJourneyDialog';

interface Props {
  collectionId?: string;
  standaloneOnly?: boolean;
  autoOpenNew?: boolean;
  onEdit: (id: string) => void;
  onLegacyEdit: (id: string) => void;
}

const STATUS_TABS = ['All', 'Draft', 'Published', 'Archived'] as const;

const TYPE_OPTIONS = ['All Types', 'core', 'companion', 'series', 'course'];

const TYPE_CONFIG: Record<string, { Icon: React.ElementType; color: string; bg: string; label: string }> = {
  core:      { Icon: BookOpen,      color: 'text-teal-600',   bg: 'bg-teal-50',   label: 'Core'      },
  companion: { Icon: Heart,         color: 'text-rose-500',   bg: 'bg-rose-50',   label: 'Companion' },
  series:    { Icon: Layers,        color: 'text-purple-600', bg: 'bg-purple-50', label: 'Series'    },
  course:    { Icon: GraduationCap, color: 'text-amber-600',  bg: 'bg-amber-50',  label: 'Course'    },
};

export default function StudioJourneyList({ collectionId, standaloneOnly, autoOpenNew, onEdit, onLegacyEdit }: Props) {
  const { journeys, refreshJourneys, updateJourney, duplicateJourney, permanentDeleteJourney } = useJourney();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'superAdmin';

  // Library mode = no collection filter, no standalone-only filter → shows all journeys
  const isLibrary = !collectionId && !standaloneOnly;

  const [query, setQuery]           = useState('');
  const [statusTab, setStatusTab]   = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState('All Types');
  const [showNew, setShowNew]       = useState(!!autoOpenNew);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef                     = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Journey | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState('');

  // Fetch collections to show the collection name badge on each journey card
  const [collectionMap, setCollectionMap] = useState<Record<string, string>>({});
  useEffect(() => {
    listCollections()
      .then(cols => setCollectionMap(Object.fromEntries(cols.map(c => [c.id, c.title]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    let list = journeys as Journey[];
    list = list.filter(j => j.journeyType !== 'daily-rhythm');
    list = list.filter(j => j.journeyType !== 'companion');
    if (collectionId) list = list.filter(j => (j as any).collectionId === collectionId);
    if (standaloneOnly) list = list.filter(j => !(j as any).collectionId);
    if (statusTab !== 'All') list = list.filter(j => j.status === statusTab);
    if (typeFilter !== 'All Types') list = list.filter(j => j.journeyType === typeFilter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q) ||
        j.tags?.some(t => t.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  }, [journeys, query, statusTab, typeFilter, collectionId, standaloneOnly]);

  const handleCreated = useCallback((id: string) => {
    setShowNew(false);
    onEdit(id);
    refreshJourneys?.();
  }, [onEdit, refreshJourneys]);

  const handleArchive = async (j: Journey) => {
    setOpenMenuId(null);
    try { await updateJourney({ ...j, status: 'Archived' } as any); } catch { /* ignore */ }
  };

  const handleDuplicate = async (j: Journey) => {
    setOpenMenuId(null);
    try {
      const copy = await duplicateJourney(j.id);
      await refreshJourneys?.();
      onEdit(copy.id);
    } catch { /* ignore */ }
  };

  const handleExport = (j: Journey) => {
    setOpenMenuId(null);
    const blob = new Blob([JSON.stringify(j, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${j.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await permanentDeleteJourney(deleteTarget.id);
    setDeleteSuccess(`"${deleteTarget.title}" was permanently deleted.`);
    setDeleteTarget(null);
    await refreshJourneys?.();
    setTimeout(() => setDeleteSuccess(''), 4000);
  };

  const pageTitle = isLibrary ? 'Walk Library' : (standaloneOnly ? 'Standalone Walks' : 'Walks');
  const pageDescription = isLibrary
    ? 'Every walk across all journeys and standalone.'
    : (standaloneOnly ? 'Walks without a journey assignment.' : 'All walks in this journey.');

  return (
    <>
      <ContentStudioListPage
        title={pageTitle}
        description={pageDescription}
        newButton={
          <button onClick={() => setShowNew(true)} className={newBtnCls}>
            <Plus size={14} /> New Walk
          </button>
        }
        toolbar={
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search walks…"
                className="w-full pl-9 pr-8 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-teal-300 text-gray-700"
            >
              {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        }
        filters={{ tabs: STATUS_TABS, active: statusTab, onChange: setStatusTab }}
        isEmpty={filtered.length === 0}
        emptyState={
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <BookOpen size={22} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-600">
              {query ? 'No journeys match that search.' : 'No journeys here yet.'}
            </p>
            {!query && (
              <button
                onClick={() => setShowNew(true)}
                className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
              >
                Create First Journey
              </button>
            )}
            {query && (
              <button onClick={() => setQuery('')} className="mt-3 text-xs text-teal-600 hover:text-teal-800">
                Clear search
              </button>
            )}
          </div>
        }
      >
        {deleteSuccess && (
          <div className="-mt-1 mb-1 px-4 py-3 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700 font-medium">
            ✓ {deleteSuccess}
          </div>
        )}

        {filtered.map(j => {
          const cfg = TYPE_CONFIG[j.journeyType] ?? TYPE_CONFIG.core;
          const isMenuOpen = openMenuId === j.id;
          const metaParts: string[] = [];
          if (j.durationDays > 0) metaParts.push(`${j.durationDays} days`);
          if (j.updatedAt) metaParts.push(new Date(j.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));

          return (
            <ContentStudioListItem
              key={j.id}
              iconBg={cfg.bg}
              iconContent={<cfg.Icon size={16} className={cfg.color} />}
              title={
                <span className="flex items-center gap-2">
                  <span className="truncate">{j.title}</span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </span>
              }
              meta={
                <span className="flex items-center gap-2 flex-wrap">
                  {metaParts.map((p, i) => (
                    <React.Fragment key={i}>
                      {i > 0 && <span className="text-gray-300">·</span>}
                      <span>{p}</span>
                    </React.Fragment>
                  ))}
                  {/* Collection badge — only shown in library mode where all journeys are listed */}
                  {isLibrary && (j as any).collectionId && collectionMap[(j as any).collectionId] && (
                    <>
                      {metaParts.length > 0 && <span className="text-gray-300">·</span>}
                      <span className="flex items-center gap-1 text-purple-600">
                        <FolderOpen size={10} />
                        {collectionMap[(j as any).collectionId]}
                      </span>
                    </>
                  )}
                  {j.tags && j.tags.length > 0 && (
                    <>
                      {(metaParts.length > 0 || ((j as any).collectionId && collectionMap[(j as any).collectionId])) && <span className="text-gray-300">·</span>}
                      <span className="flex items-center gap-1">
                        <Tag size={10} />
                        {j.tags.slice(0, 2).join(', ')}
                      </span>
                    </>
                  )}
                </span>
              }
              status={<StatusBadge status={j.status} />}
              onClick={() => onEdit(j.id)}
              actions={
                <>
                  <button
                    onClick={() => onEdit(j.id)}
                    className={`${actionBtnCls} flex items-center gap-1`}
                  >
                    <Layers size={11} /> Edit
                  </button>
                  <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                    <button
                      onClick={() => setOpenMenuId(isMenuOpen ? null : j.id)}
                      className={menuBtnCls}
                      aria-haspopup="true"
                      aria-expanded={isMenuOpen}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                    {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-100 rounded-xl shadow-lg py-1 min-w-[176px]">
                        <button
                          onClick={() => handleArchive(j)}
                          className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Archive size={14} className="text-gray-400" /> Archive Journey
                        </button>
                        <button
                          onClick={() => handleDuplicate(j)}
                          className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Copy size={14} className="text-gray-400" /> Duplicate Journey
                        </button>
                        <button
                          onClick={() => handleExport(j)}
                          className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <Download size={14} className="text-gray-400" /> Export Journey
                        </button>
                        {isSuperAdmin && (
                          <>
                            <div className="my-1 border-t border-gray-100" />
                            <button
                              onClick={() => { setOpenMenuId(null); setDeleteTarget(j); }}
                              className="flex items-center gap-2.5 w-full text-left px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={14} /> Delete Journey…
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              }
            />
          );
        })}
      </ContentStudioListPage>

      {showNew && (
        <NewJourneyModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
          defaultCollectionId={collectionId}
        />
      )}

      {deleteTarget && (
        <DeleteJourneyDialog
          journeyTitle={deleteTarget.title}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
