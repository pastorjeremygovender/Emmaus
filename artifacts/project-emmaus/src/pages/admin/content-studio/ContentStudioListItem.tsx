/**
 * ContentStudioListItem — shared row component for all Content Studio list screens.
 *
 * Every list in Daily Rhythm, Daily Devotionals, Journeys, and Sermon Companions
 * uses this exact component so that border, radius, padding, hover state,
 * status badge, typography, and action spacing are guaranteed to be identical
 * across all four screens.
 *
 * Layout: [Icon] [Title + Meta] [Status] [Actions]
 */

import React from 'react';

export interface ContentStudioListItemProps {
  /** Content rendered inside the 40×40 icon box (an icon component, a number, etc.) */
  iconContent: React.ReactNode;
  /** Tailwind background class for the icon box, e.g. "bg-teal-50". Default: "bg-gray-100" */
  iconBg?: string;
  /** Primary row title — always single line, truncated */
  title: React.ReactNode;
  /** One or two lines of metadata beneath the title; may be any ReactNode */
  meta?: React.ReactNode;
  /** Status badge — rendered between the body and actions */
  status?: React.ReactNode;
  /** Action buttons at the trailing edge */
  actions?: React.ReactNode;
  /** Clicking the title/meta body area fires this handler */
  onClick?: () => void;
}

export default function ContentStudioListItem({
  iconContent,
  iconBg = 'bg-gray-100',
  title,
  meta,
  status,
  actions,
  onClick,
}: ContentStudioListItemProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3.5 hover:border-gray-200 hover:bg-gray-50/40 transition-colors group">

      <div className="flex items-start gap-3 sm:gap-4 min-w-0 w-full">
        {/* Icon box */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {iconContent}
        </div>

        {/* Body — title + optional metadata */}
        <div
          className={`flex-1 min-w-0 ${onClick ? 'cursor-pointer' : ''}`}
          onClick={onClick}
          role={onClick ? 'button' : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={onClick ? (e) => { if (e.key === 'Enter') onClick(); } : undefined}
        >
          <p className="text-[14px] font-medium text-gray-900 truncate leading-snug">
            {title}
          </p>
          {meta != null && (
            <div className="text-[12px] text-gray-400 mt-0.5 leading-snug">
              {meta}
            </div>
          )}
        </div>
      </div>

      {(status != null || actions != null) && (
        <div className="flex items-center justify-between sm:justify-start gap-2 w-full sm:w-auto pl-[52px] sm:pl-0">
          {status != null && (
            <div className="flex-shrink-0">
              {status}
            </div>
          )}
          {actions != null && (
            <div className="flex items-center gap-1 flex-shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
