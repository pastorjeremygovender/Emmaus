import React, { useState } from 'react';
import { ArrowLeft, Save, CheckCircle2, Trash2, Loader2, EyeOff } from 'lucide-react';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  // Journey / sermon / media statuses
  Draft: 'bg-gray-100 text-gray-700',
  draft: 'bg-gray-100 text-gray-700',
  'Pastoral Review': 'bg-amber-100 text-amber-800',
  review: 'bg-amber-100 text-amber-800',
  Approved: 'bg-blue-100 text-blue-800',
  approved: 'bg-blue-100 text-blue-800',
  Scheduled: 'bg-purple-100 text-purple-800',
  scheduled: 'bg-purple-100 text-purple-800',
  Published: 'bg-emerald-100 text-emerald-800',
  published: 'bg-emerald-100 text-emerald-800',
  Archived: 'bg-gray-100 text-gray-400',
  archived: 'bg-gray-100 text-gray-400',
  // Prayer statuses
  new: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-amber-100 text-amber-800',
  followed_up: 'bg-teal-100 text-teal-800',
  answered: 'bg-emerald-100 text-emerald-800',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';
  const label = status.replace(/_/g, ' ');
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

// ─── Confirmation dialog ──────────────────────────────────────────────────────

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-[15px]">{title}</h2>
        <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              danger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-teal-700 text-white hover:bg-teal-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Unsaved changes banner ───────────────────────────────────────────────────

export function UnsavedBanner({ onDiscard }: { onDiscard: () => void }) {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between">
      <span className="text-sm text-amber-800">You have unsaved changes.</span>
      <button onClick={onDiscard} className="text-sm text-amber-700 underline hover:text-amber-900">
        Discard
      </button>
    </div>
  );
}

// ─── Save status message ──────────────────────────────────────────────────────

export function SaveMessage({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  if (state === 'idle') return null;
  const map = {
    saving: { cls: 'text-gray-400', text: 'Saving…' },
    saved: { cls: 'text-emerald-600', text: '✓ Saved' },
    error: { cls: 'text-red-600', text: 'Save failed — please try again.' },
  } as const;
  const { cls, text } = map[state as keyof typeof map];
  return <span className={`text-sm ${cls}`}>{text}</span>;
}

// ─── Section heading ──────────────────────────────────────────────────────────

export function PageHeader({
  title,
  subtitle,
  action,
  onBack,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-start gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="mt-0.5 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
            aria-label="Back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0 ml-4">{action}</div>}
    </div>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────

export function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

// ─── Text input ───────────────────────────────────────────────────────────────

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  const { error, ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full px-3 py-2 rounded-lg border text-sm bg-white transition-colors outline-none focus:ring-2 focus:ring-teal-500/30 ${
        error ? 'border-red-400' : 'border-gray-200 focus:border-teal-500'
      } ${rest.className ?? ''}`}
    />
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }) {
  const { error, ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`w-full px-3 py-2 rounded-lg border text-sm bg-white transition-colors outline-none focus:ring-2 focus:ring-teal-500/30 resize-y ${
        error ? 'border-red-400' : 'border-gray-200 focus:border-teal-500'
      } ${rest.className ?? ''}`}
    />
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 outline-none ${props.className ?? ''}`}
    />
  );
}

// ─── Admin button ─────────────────────────────────────────────────────────────

export function AdminBtn({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const base = `inline-flex items-center gap-1.5 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none`;
  const sizes = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2 text-sm' };
  const variants = {
    primary: 'bg-teal-700 text-white hover:bg-teal-800',
    secondary: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${sizes[size]} ${variants[variant]}`}>
      {children}
    </button>
  );
}

// ─── Table wrapper ────────────────────────────────────────────────────────────

// ─── Collapsible card ─────────────────────────────────────────────────────────

export function CollapsibleCard({
  title,
  children,
  defaultOpen = true,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {badge}
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Table wrapper ────────────────────────────────────────────────────────────

export function AdminTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-3 text-left text-[11px] font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 ${className}`}>
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={`px-4 py-3 text-gray-700 ${className}`}>{children}</td>;
}

// ─── Content Studio Toolbar ───────────────────────────────────────────────────
// Shared compact sticky bar used by every Content Studio editor.
// Buttons always appear in this order: ← Back | Save Draft | Publish/Unpublish | Delete

export interface ContentStudioToolbarProps {
  onBack: () => void;
  title: string;
  subtitle?: string;
  /** Current status string — 'Published'/'published' triggers Unpublish mode */
  status?: string;
  isSaving?: boolean;
  isPublishing?: boolean;
  successMessage?: string;
  errorMessage?: string;
  onSaveDraft: () => void;
  /** When provided a Publish (or Unpublish) button appears */
  onPublish?: () => void;
  /** When provided, used for the confirmed Unpublish action; falls back to onPublish */
  onUnpublish?: () => void;
  /** When provided, a trash-icon Delete button appears */
  onDelete?: () => void;
  /** Slot rendered between the message area and Save Draft (e.g. Help Me Write) */
  extraActions?: React.ReactNode;
}

export function ContentStudioToolbar({
  onBack,
  title,
  subtitle,
  status,
  isSaving = false,
  isPublishing = false,
  successMessage,
  errorMessage,
  onSaveDraft,
  onPublish,
  onUnpublish,
  onDelete,
  extraActions,
}: ContentStudioToolbarProps) {
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const isPublished = status === 'Published' || status === 'published';
  const isDisabled = isSaving || isPublishing;

  return (
    <>
      <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between px-3 sm:px-5 py-3 bg-white border-b border-gray-100 gap-2">
        {/* Left: back + title */}
        <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors flex-shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={15} />
          </button>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-gray-700 truncate leading-tight">{title}</p>
            {subtitle && <p className="text-[11px] text-gray-400 truncate leading-tight">{subtitle}</p>}
          </div>
        </div>

        {/* Right: message + actions */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end">
          {successMessage && (
            <span className="basis-full sm:basis-auto text-[12px] font-medium text-emerald-600 flex items-center gap-1">
              <CheckCircle2 size={11} /> {successMessage}
            </span>
          )}
          {!successMessage && errorMessage && (
            <span className="basis-full sm:basis-auto text-[12px] text-red-500">{errorMessage}</span>
          )}

          {extraActions}

          {/* Save Draft */}
          <button
            onClick={onSaveDraft}
            disabled={isDisabled}
            className="flex-1 sm:flex-none min-h-10 justify-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save Draft
          </button>

          {/* Publish / Unpublish */}
          {(onPublish || onUnpublish) && (
            isPublished ? (
              <button
                onClick={() => setShowUnpublishDialog(true)}
                disabled={isDisabled}
                className="flex-1 sm:flex-none min-h-10 justify-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 text-[13px] hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                {isPublishing ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}
                Unpublish
              </button>
            ) : (
              <button
                onClick={onPublish}
                disabled={isDisabled || !onPublish}
                className="flex-1 sm:flex-none min-h-10 justify-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {isPublishing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                Publish
              </button>
            )
          )}

          {/* Delete */}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Delete"
              disabled={isDisabled}
                className="min-w-10 min-h-10 inline-flex items-center justify-center p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Unpublish confirmation dialog */}
      {showUnpublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-2">Unpublish this content?</h3>
            <p className="text-sm text-gray-500 mb-4">Members will no longer see it.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowUnpublishDialog(false)}
                disabled={isPublishing}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowUnpublishDialog(false); (onUnpublish ?? onPublish)?.(); }}
                disabled={isPublishing}
                className="flex-1 px-4 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {isPublishing
                  ? <><Loader2 size={13} className="animate-spin" /> Unpublishing…</>
                  : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
