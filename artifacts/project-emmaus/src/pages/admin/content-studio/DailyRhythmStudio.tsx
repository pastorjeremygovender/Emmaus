/**
 * DailyRhythmStudio — Daily Rhythm list screen.
 *
 * There is one Daily Rhythm: "10 Minutes with Jesus".
 * Displays every day using the shared ContentStudioListItem row.
 */
import React, { useMemo, useState } from 'react';
import { Sun, Plus, Clock, FileText, AlertTriangle, Tag } from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey, Step } from '@/lib/journeys-api';
import { bulkGenerateStepLabels } from '@/lib/journeys-api';
import { useAuth } from '@/contexts/AuthContext';
import { StatusBadge } from '../shared';
import ContentStudioListItem from './ContentStudioListItem';
import ContentStudioListPage, { actionBtnCls, newBtnCls } from './ContentStudioListPage';
import NewDayModal from './NewDayModal';
import GenerateLabelsModal from './GenerateLabelsModal';
import GroupMembershipBadge from './GroupMembershipBadge';

const STATUS_TABS = ['All', 'Draft', 'Published', 'Archived'] as const;

interface Props {
  onNewDay: (journeyId: string) => void;
  onEditDay: (journeyId: string, day: number) => void;
}

export default function DailyRhythmStudio({ onNewDay, onEditDay }: Props) {
  const { journeys, steps, loading, refreshSteps } = useJourney();
  const { user } = useAuth();
  const [statusTab,          setStatusTab]          = useState<string>('All');
  const [showNewModal,       setShowNewModal]        = useState(false);
  const [showLabelsModal,    setShowLabelsModal]     = useState(false);

  const journey = useMemo(
    () => (journeys as Journey[]).find(j => j.journeyType === 'daily-rhythm') ?? null,
    [journeys],
  );

  const days = useMemo(() => {
    if (!journey) return [];
    return [...(steps as Step[]).filter(s => s.journeyId === journey.id)]
      .sort((a, b) => a.day - b.day);
  }, [steps, journey]);

  const filtered = useMemo(() =>
    statusTab === 'All'
      ? days
      : days.filter(s => ((s as any).status ?? 'Draft') === statusTab),
    [days, statusTab],
  );

  const description = journey
    ? `10 Minutes with Jesus · ${days.length} day${days.length !== 1 ? 's' : ''} authored`
    : 'A daily walk with Jesus for every member.';

  // Group membership badge shown in the page header area for the Daily Rhythm journey
  const groupBadge = journey ? (
    <div className="flex items-center gap-2 mt-1">
      <span className="text-[11px] text-gray-400">Groups:</span>
      <GroupMembershipBadge targetType="daily-rhythm" targetId={journey.id} />
    </div>
  ) : null;

  return (
    <>
    <ContentStudioListPage
      title="Daily Rhythm"
      description={
        <span>
          {description}
          {groupBadge}
        </span>
      }
      newButton={
        <div className="flex items-center gap-2">
          {journey && days.length > 0 && (
            <button
              onClick={() => setShowLabelsModal(true)}
              disabled={loading}
              className={actionBtnCls}
              title="Bulk-generate display labels"
            >
              <Tag size={13} /> Generate Labels
            </button>
          )}
          <button
            onClick={() => journey && setShowNewModal(true)}
            disabled={!journey || loading}
            className={newBtnCls}
          >
            <Plus size={14} /> New Day
          </button>
        </div>
      }
      filters={{ tabs: STATUS_TABS, active: statusTab, onChange: setStatusTab }}
      loading={loading}
      loadingText="Loading Daily Rhythm…"
      isEmpty={!loading && (!journey || filtered.length === 0)}
      emptyState={
        !journey ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
              <AlertTriangle size={22} className="text-amber-500" />
            </div>
            <p className="text-sm font-medium text-gray-700">Couldn't load Daily Rhythm content.</p>
            <p className="text-xs text-gray-400 mt-1 max-w-[280px]">
              The "10 Minutes with Jesus" journey wasn't found. This may be a connection issue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-5 px-5 py-2.5 border border-gray-200 text-sm font-medium text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
              <FileText size={22} className="text-teal-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {statusTab === 'All' ? 'No Daily Rhythm days have been created yet.' : `No ${statusTab} days.`}
            </p>
            {statusTab === 'All' && (
              <>
                <p className="text-xs text-gray-400 mt-1">Click "New Day" to write Day 1.</p>
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-5 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
                >
                  + New Day
                </button>
              </>
            )}
          </div>
        )
      }
    >
      {filtered.map(step => (
        <ContentStudioListItem
          key={step.day}
          iconBg="bg-teal-50"
          iconContent={
            <span className="text-[13px] font-semibold text-teal-700">{step.day}</span>
          }
          title={step.title || <span className="italic text-gray-400">Untitled</span>}
          meta={
            (step.scripture || step.estimatedReadingTime) ? (
              <span className="flex items-center gap-3">
                {step.scripture && <span className="truncate max-w-[260px]">{step.scripture}</span>}
                {step.estimatedReadingTime && (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <Clock size={10} /> {step.estimatedReadingTime} min
                  </span>
                )}
              </span>
            ) : undefined
          }
          status={<StatusBadge status={(step as any).status ?? 'Draft'} />}
          actions={
            <button
              onClick={() => onEditDay(journey!.id, step.day)}
              className={actionBtnCls}
            >
              Edit
            </button>
          }
          onClick={() => onEditDay(journey!.id, step.day)}
        />
      ))}
    </ContentStudioListPage>

    {showNewModal && journey && (
      <NewDayModal
        journeyId={journey.id}
        onClose={() => setShowNewModal(false)}
        onScratch={() => { setShowNewModal(false); onNewDay(journey.id); }}
        onCreated={(day) => { setShowNewModal(false); onEditDay(journey.id, day); }}
      />
    )}

    {showLabelsModal && journey && (
      <GenerateLabelsModal
        itemCount={days.filter(s => !(s as any).isCompletionStep).length}
        onApply={async (opts) => {
          const result = await bulkGenerateStepLabels(journey.id, opts, user?.id);
          await refreshSteps(journey.id);
          return result.updated;
        }}
        onClose={() => setShowLabelsModal(false)}
      />
    )}
  </>
  );
}
