/**
 * EmmausContentEditor — shared two-panel layout shell for all Emmaus day/entry editors.
 *
 * Provides a consistent visual container so every content type — Daily Rhythm,
 * Daily Devotionals, Journeys, and Sermon Companions — looks and behaves identically.
 *
 * Layout:
 *   [toolbar]
 *   [aboveSplit]  ← optional day-selector / status strip
 *   ┌─────────────────────────┬───────────────┐
 *   │  Left: editable fields  │ Right: Preview │
 *   │  (scrollable, flex-1)   │ (360px fixed)  │
 *   └─────────────────────────┴───────────────┘
 *   [dialogs]  ← rendered outside layout flow (confirms, overlays)
 *
 * Every editor using this shell:
 *   - uses ContentStudioToolbar as the `toolbar` prop
 *   - passes its actual member renderer as the `preview` prop (no fake previews)
 *   - puts editable fields inside a <div className="flex-1 p-6 space-y-5 max-w-2xl"> wrapper
 */

import React from 'react';

export interface EmmausContentEditorProps {
  /** Toolbar rendered at the very top — use ContentStudioToolbar */
  toolbar: React.ReactNode;
  /** Left panel content — the editable fields */
  fields: React.ReactNode;
  /** Right panel content — the live member preview renderer */
  preview: React.ReactNode;
  /**
   * Optional content rendered between the toolbar and the two-panel split.
   * Use for day-selector pill strips, status banners, or tab bars that belong
   * to this specific editor (not the overall Content Studio navigation).
   */
  aboveSplit?: React.ReactNode;
  /** Dialogs, confirms, and full-screen overlays rendered outside the layout flow */
  dialogs?: React.ReactNode;
}

export default function EmmausContentEditor({
  toolbar,
  fields,
  preview,
  aboveSplit,
  dialogs,
}: EmmausContentEditorProps) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">
      {/* Fixed toolbar */}
      {toolbar}

      {/* Optional day-selector / banner strip */}
      {aboveSplit}

      {/* Two-panel split */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel: editor fields */}
        <div className="flex flex-col flex-1 min-w-0 bg-white border-r border-gray-200 overflow-y-auto">
          {fields}
        </div>

        {/* Right panel: live member preview */}
        <div className="w-[360px] flex-shrink-0 bg-background border-l border-gray-200 overflow-y-auto">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-center">
              Preview
            </p>
          </div>
          {preview}
        </div>

      </div>

      {/* Dialogs rendered outside layout flow */}
      {dialogs}
    </div>
  );
}
