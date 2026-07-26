import React, { useState, useRef, useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
  trackTitle: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

const DELETED_DATA = [
  'Daily Rhythm track & all metadata',
  'All authored days (Steps)',
  'Drafts & version history',
  'Published versions',
  'Member progress & completion records',
  'Daily progress linked to this track',
  'Notifications linked to this track',
];

export default function DeleteDailyRhythmDialog({ trackTitle, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  const canDelete = typed === 'DELETE';

  const handleConfirm = async () => {
    if (!canDelete || busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch {
      setError('We couldn\'t delete this content. Please try again.');
      setBusy(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canDelete) handleConfirm();
    if (e.key === 'Escape') onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-rhythm-dialog-title"
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 mt-0.5">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div>
            <h2 id="delete-rhythm-dialog-title" className="text-base font-semibold text-gray-900">
              Delete Daily Rhythm Entry Permanently?
            </h2>
            <p className="text-sm text-gray-500 mt-0.5 leading-snug">
              <span className="font-medium text-gray-700">"{trackTitle}"</span>
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-600">
            This will permanently delete this Daily Rhythm entry and any progress connected to it:
          </p>
          <ul className="space-y-1.5">
            {DELETED_DATA.map(item => (
              <li key={item} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>

          <p className="text-sm font-semibold text-red-600">
            This action cannot be undone.
          </p>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-700" htmlFor="delete-rhythm-confirm-input">
              To continue, type <span className="font-mono font-bold tracking-widest text-red-600">DELETE</span>
            </label>
            <input
              id="delete-rhythm-confirm-input"
              ref={inputRef}
              type="text"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={handleKey}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 text-sm font-mono border-2 rounded-xl focus:outline-none transition-colors
                border-gray-200 focus:border-red-400 bg-gray-50 placeholder:text-gray-300"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 pb-6">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canDelete || busy}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete Permanently'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
