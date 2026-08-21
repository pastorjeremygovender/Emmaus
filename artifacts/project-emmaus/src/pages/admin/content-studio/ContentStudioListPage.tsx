/**
 * ContentStudioListPage — shared page-layout wrapper for all Content Studio list screens.
 *
 * Provides a consistent:
 *   - Max content width (max-w-4xl)
 *   - Page header (title · description · New button)
 *   - Optional secondary toolbar slot (search, type filter, etc.)
 *   - Optional filter tab row (All / Draft / Published / Archived)
 *   - Loading / empty / content states
 *   - 12px gap between list rows (space-y-3)
 *
 * All four list screens pass their content as children (ContentStudioListItem rows).
 */

import React from 'react';
import { Plus, Loader2, ChevronUp, ChevronDown } from 'lucide-react';

interface FilterConfig {
  tabs: readonly string[];
  active: string;
  onChange: (tab: string) => void;
}

export interface ContentStudioListPageProps {
  /** Section title, e.g. "Daily Rhythm", "Daily Devotionals" */
  title: string;
  /** One-line description shown beneath the title */
  description: React.ReactNode;
  /** Primary "New X" button, rendered at the top right */
  newButton: React.ReactNode;
  /** Optional secondary toolbar rendered between header and filter tabs (search, type dropdown) */
  toolbar?: React.ReactNode;
  /** Optional filter tabs — All / Draft / Published / Archived */
  filters?: FilterConfig;
  /** Show the loading spinner instead of content */
  loading?: boolean;
  loadingText?: string;
  /** When true and not loading, show emptyState instead of children */
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  /** Optional content section rendered immediately before the list rows. */
  beforeList?: React.ReactNode;
  children?: React.ReactNode;
}

export default function ContentStudioListPage({
  title,
  description,
  newButton,
  toolbar,
  filters,
  loading,
  loadingText = 'Loading…',
  isEmpty,
  emptyState,
  beforeList,
  children,
}: ContentStudioListPageProps) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-5 sm:py-6">

      {/* ── Page Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
        <div className="flex-shrink-0 w-full sm:w-auto">
          {newButton}
        </div>
      </div>

      {/* ── Secondary toolbar (search / type filter / etc.) ──────────────────── */}
      {toolbar && (
        <div className="mb-5">
          {toolbar}
        </div>
      )}

      {/* ── Filter tabs ──────────────────────────────────────────────────────── */}
      {filters && (
          <div className="flex gap-1 overflow-x-auto scrollbar-none border-b border-gray-100 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
          {filters.tabs.map(tab => (
            <button
              key={tab}
              onClick={() => filters.onChange(tab)}
              className={`flex-shrink-0 min-h-10 px-3.5 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px ${
                filters.active === tab
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* ── Content ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">{loadingText}</span>
        </div>
      ) : isEmpty ? (
        <>{emptyState}</>
      ) : (
        <div>
          {beforeList}
          <div className="space-y-3">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared action button styles ───────────────────────────────────────────────
// Utility classes exported so every list screen uses identical button styles.

export const actionBtnCls =
  'text-[12px] text-teal-600 hover:text-teal-800 font-medium px-2.5 py-1.5 rounded-lg hover:bg-teal-50 transition-colors';

export const menuBtnCls =
  'p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors';

export const newBtnCls =
  'flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-40';

/** Accessible, compact controls for persisted list ordering. */
export function ReorderButtons({
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  label = 'Reorder item',
}: {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center rounded-lg border border-gray-200 bg-white">
      <button type="button" disabled={!canMoveUp} onClick={onMoveUp}
        className="p-1.5 text-gray-500 hover:text-teal-700 hover:bg-teal-50 disabled:opacity-25 disabled:cursor-not-allowed"
        aria-label={`${label}: move up`} title="Move up">
        <ChevronUp size={13} />
      </button>
      <span className="h-4 border-l border-gray-200" />
      <button type="button" disabled={!canMoveDown} onClick={onMoveDown}
        className="p-1.5 text-gray-500 hover:text-teal-700 hover:bg-teal-50 disabled:opacity-25 disabled:cursor-not-allowed"
        aria-label={`${label}: move down`} title="Move down">
        <ChevronDown size={13} />
      </button>
    </span>
  );
}
