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

import React, { useState } from 'react';
import { Eye, X } from 'lucide-react';

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
  const [showMobilePreview, setShowMobilePreview] = useState(false);

  return (
    <div className="flex flex-col h-full min-h-0 bg-gray-50">
      {/* Fixed toolbar */}
      {toolbar}

      {/* Optional day-selector / banner strip */}
      {aboveSplit}

      <div className="md:hidden flex items-center justify-between gap-3 px-4 py-2.5 bg-white border-b border-gray-100">
        <p className="text-[12px] font-medium text-gray-500">Editing content</p>
        <button
          type="button"
          onClick={() => setShowMobilePreview(true)}
          className="min-h-10 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 text-teal-700 text-[13px] font-medium border border-teal-100"
        >
          <Eye size={15} />
          Preview
        </button>
      </div>

      {/* Two-panel split */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">

        {/* Left panel: editor fields */}
        <div className="flex flex-col flex-1 min-w-0 bg-white md:border-r border-gray-200 overflow-y-auto">
          {fields}
        </div>

        {/* Right panel: live member preview */}
        <div className="hidden md:block w-[360px] flex-shrink-0 bg-background border-l border-gray-200 overflow-y-auto">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide text-center">
              Preview
            </p>
          </div>
          {preview}
        </div>

      </div>

      {showMobilePreview && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Member preview"
        >
          <button
            type="button"
            aria-label="Close preview"
            className="absolute inset-0 cursor-default"
            onClick={() => setShowMobilePreview(false)}
          />
          <section className="absolute inset-x-0 bottom-0 max-h-[86dvh] flex flex-col bg-background rounded-t-3xl shadow-2xl overflow-hidden">
            <header className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-gray-100 flex-shrink-0">
              <div>
                <p className="text-[13px] font-semibold text-gray-800">Member preview</p>
                <p className="text-[11px] text-gray-400">This is exactly what members will see.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMobilePreview(false)}
                className="min-w-10 min-h-10 inline-flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"
                aria-label="Close preview"
              >
                <X size={18} />
              </button>
            </header>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
              {preview}
            </div>
          </section>
        </div>
      )}

      {/* Dialogs rendered outside layout flow */}
      {dialogs}
    </div>
  );
}
