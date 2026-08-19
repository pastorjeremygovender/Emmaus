/**
 * UnifiedBibleStudy — single consolidated Bible Study admin section.
 *
 * Five tabs (spec-locked):
 *   1. Overview         — publishing progress & completion stats per book
 *   2. Notes            — study note editing, publishing, search
 *   3. Cross References — cross-reference pair management
 *   4. Generation       — AI book/passage content generation
 *   5. Book Intros      — book introduction generation and editing
 *
 * Replaces the two previous Bible Study surfaces (Content Studio tab + left-nav
 * BibleStudyAdmin) with a single unified entry point. All underlying components
 * are unchanged — this is purely a navigation wrapper.
 */

import React, { useState } from 'react';
import { TrendingUp, BookOpen, Link2, Sparkles, BookMarked } from 'lucide-react';
import BibleProgressDashboard from './content-studio/BibleProgressDashboard';
import BibleStudyAdmin from './BibleStudyAdmin';
import BibleContentGenerator from './content-studio/BibleContentGenerator';
import BibleContentStudio from './content-studio/BibleContentStudio';
import BibleStudyBulkImporter from './BibleStudyBulkImporter';

type BibleTab = 'overview' | 'notes' | 'crossrefs' | 'generation' | 'book-intros';

const TABS: { id: BibleTab; label: string; Icon: React.ElementType }[] = [
  { id: 'overview',    label: 'Overview',        Icon: TrendingUp },
  { id: 'notes',       label: 'Notes',            Icon: BookOpen   },
  { id: 'crossrefs',   label: 'Cross References', Icon: Link2      },
  { id: 'generation',  label: 'Generation',       Icon: Sparkles   },
  { id: 'book-intros', label: 'Book Intros',      Icon: BookMarked },
];

export default function UnifiedBibleStudy() {
  const [activeTab, setActiveTab] = useState<BibleTab>('overview');

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Tab bar ───────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between px-6 pt-4 pb-0 gap-4 sm:gap-0">
          <div
            className="flex items-center gap-1 overflow-x-auto scrollbar-none"
            role="tablist"
            aria-label="Bible Study sections"
          >
            {TABS.map(({ id, label, Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(id)}
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
          <div className="pb-2">
            <BibleStudyBulkImporter onReturnToNotes={() => setActiveTab('notes')} />
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" role="tabpanel">
        {activeTab === 'overview' && (
          <div className="p-6 lg:p-8 max-w-4xl">
            <BibleProgressDashboard />
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="p-6 lg:p-8 max-w-4xl">
            {/* Key ensures the component remounts when switching to this tab,
                resetting any in-progress edits from Cross References view */}
            <BibleStudyAdmin key="notes" defaultTab="notes" />
          </div>
        )}

        {activeTab === 'crossrefs' && (
          <div className="p-6 lg:p-8 max-w-4xl">
            <BibleStudyAdmin key="crossrefs" defaultTab="crossrefs" />
          </div>
        )}

        {activeTab === 'generation' && (
          <div className="p-6 lg:p-8 max-w-4xl">
            <BibleContentGenerator />
          </div>
        )}

        {/* Book Intros uses BibleContentStudio's own shell (no extra padding wrapper) */}
        {activeTab === 'book-intros' && (
          <BibleContentStudio initialSubView="book-intros" />
        )}
      </div>
    </div>
  );
}
