import React, { useState } from 'react';

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  // Journey / sermon statuses
  Draft: 'bg-gray-100 text-gray-700',
  draft: 'bg-gray-100 text-gray-700',
  'Pastoral Review': 'bg-amber-100 text-amber-800',
  review: 'bg-amber-100 text-amber-800',
  Approved: 'bg-blue-100 text-blue-800',
  approved: 'bg-blue-100 text-blue-800',
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
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
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
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]}`}>
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

export function Td({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-gray-700 ${className}`}>{children}</td>;
}
