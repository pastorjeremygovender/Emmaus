import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  Eye,
  Info,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getPastoralBriefingRules,
  previewPastoralBriefingRules,
  restorePastoralBriefingDefaults,
  savePastoralBriefingRules,
  type AuthHeaders,
  type PastoralBriefingMatch,
  type PastoralBriefingPreview,
  type PastoralBriefingRules as BriefingRules,
  type StoredPastoralBriefingRules,
} from "@/lib/pastoral-api";
import { AdminBtn, ConfirmDialog } from "../../shared";

type SaveState = "idle" | "saving" | "saved" | "error";
type PreviewState = "idle" | "loading" | "ready" | "error";

const LIMITS = {
  missedServicesThreshold: { min: 1, max: 12 },
  emmausInactivityDays: { min: 1, max: 90 },
  stalledProgressDays: { min: 1, max: 90 },
  newUserGracePeriodDays: { min: 0, max: 90 },
} as const;

const RULE_KEYS: Array<keyof BriefingRules> = [
  "attendanceAlertsEnabled",
  "missedServicesThreshold",
  "emmausInactivityAlertsEnabled",
  "emmausInactivityDays",
  "stalledProgressAlertsEnabled",
  "stalledProgressDays",
  "newUserGracePeriodDays",
  "excludeTestAccounts",
  "excludeInactiveAccounts",
  "excludeVisitors",
  "excludeUnlinkedProfiles",
  "excludeChurchAdministrators",
  "excludeWithoutActiveIdentity",
];

function toDraft(stored: StoredPastoralBriefingRules): BriefingRules {
  return RULE_KEYS.reduce((rules, key) => {
    rules[key] = stored[key] as never;
    return rules;
  }, {} as BriefingRules);
}

function areSameRules(first: BriefingRules | null, second: BriefingRules | null): boolean {
  if (!first || !second) return false;
  return RULE_KEYS.every(key => first[key] === second[key]);
}

function formatSavedDate(value: string | null): string {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#28766b]/35 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "border-[#28766b] bg-[#28766b]"
          : "border-[#c8d5d0] bg-[#dfe8e3]",
      ].join(" ")}
    >
      <span
        className={[
          "h-[18px] w-[18px] rounded-full bg-[#fbfcf8] shadow-sm transition-transform",
          checked ? "translate-x-[21px]" : "translate-x-[3px]",
        ].join(" ")}
      />
    </button>
  );
}

function NumberField({
  label,
  description,
  value,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const invalid = !Number.isInteger(value) || value < min || value > max;
  return (
    <div className="rounded-xl border border-[#dbe5df] bg-[#fbfcf8] p-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label className="block text-sm font-semibold text-[#26453e]">{label}</label>
          <p className="mt-1 max-w-[38rem] text-xs leading-relaxed text-[#6d817b]">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={value}
            disabled={disabled}
            aria-label={label}
            aria-invalid={invalid}
            onChange={event => {
              const raw = event.target.value;
              onChange(raw === "" ? 0 : Number(raw));
            }}
            className={[
              "h-10 w-[4.75rem] rounded-lg border bg-[#fbfcf8] px-2.5 text-center text-sm font-semibold text-[#203e38]",
              "outline-none transition-colors focus:ring-2 focus:ring-[#28766b]/20",
              invalid
                ? "border-[#bd6b50] focus:border-[#bd6b50]"
                : "border-[#cbd9d2] focus:border-[#28766b]",
              "disabled:cursor-not-allowed disabled:bg-[#edf2ee] disabled:text-[#80918b]",
            ].join(" ")}
          />
          <span className="w-12 text-xs text-[#738780]">{suffix}</span>
        </div>
      </div>
      {invalid && (
        <p className="mt-2 text-xs font-medium text-[#a24f3e]">
          Enter a whole number from {min} to {max}.
        </p>
      )}
    </div>
  );
}

function AlertFamily({
  icon,
  eyebrow,
  title,
  description,
  enabled,
  onToggle,
  children,
  disabled,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={[
      "rounded-2xl border p-4 transition-colors sm:p-5",
      enabled ? "border-[#c7dcd3] bg-[#f8fbf7]" : "border-[#dfe7e1] bg-[#f5f7f3]",
    ].join(" ")}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <div className={[
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            enabled ? "bg-[#e0f0e7] text-[#28766b]" : "bg-[#e8ede9] text-[#80918b]",
          ].join(" ")}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a9b94]">{eyebrow}</p>
            <h3 className="mt-1 text-[15px] font-semibold text-[#26453e]">{title}</h3>
            <p className="mt-1.5 max-w-[42rem] text-xs leading-relaxed text-[#6d817b]">{description}</p>
          </div>
        </div>
        <Toggle checked={enabled} onChange={onToggle} label={`${title} alerts`} disabled={disabled} />
      </div>
      {enabled && <div className="mt-4 border-t border-[#dfe9e2] pt-3">{children}</div>}
      {!enabled && (
        <p className="mt-3 pl-12 text-xs italic text-[#8a9b94]">
          This family is hidden from Today while it is turned off.
        </p>
      )}
    </div>
  );
}

function ExclusionRow({
  title,
  description,
  checked,
  onToggle,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[#315149]">{title}</p>
        <p className="mt-1 max-w-[38rem] text-xs leading-relaxed text-[#71847d]">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onToggle} label={title} disabled={disabled} />
    </div>
  );
}

function PreviewMatch({ match }: { match: PastoralBriefingMatch }) {
  return (
    <div className="border-t border-[#e3ebe5] py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e6efe7] text-xs font-bold text-[#28766b]">
          {getInitials(match.personName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#294840]">{match.personName}</p>
          <div className="mt-2 space-y-1.5">
            {match.flags.map(flag => (
              <div key={`${match.personId}-${flag.type}`} className="rounded-lg bg-[#f5f8f4] px-2.5 py-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#a36842]">{flag.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[#70827b]">{flag.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading briefing rule settings">
      <div className="h-28 rounded-2xl bg-[#e5eee8]" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-4">
          <div className="h-48 rounded-2xl bg-[#e5eee8]" />
          <div className="h-52 rounded-2xl bg-[#e5eee8]" />
        </div>
        <div className="h-80 rounded-2xl bg-[#e5eee8]" />
      </div>
    </div>
  );
}

export default function PastoralBriefingRules({ onBack }: { onBack?: () => void }) {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const goBack = onBack ?? (() => setLocation("/admin"));
  const [savedRules, setSavedRules] = useState<BriefingRules | null>(null);
  const [draft, setDraft] = useState<BriefingRules | null>(null);
  const [metadata, setMetadata] = useState<StoredPastoralBriefingRules | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [preview, setPreview] = useState<PastoralBriefingPreview | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const isAuthorized = user?.role === "admin" || user?.role === "superAdmin";
  const auth = useMemo<AuthHeaders | null>(
    () => (user ? { userId: user.id, userRole: user.role } : null),
    [user],
  );
  const hasUnsavedChanges = Boolean(draft && savedRules && !areSameRules(draft, savedRules));
  const hasInvalidValues = Boolean(
    draft && Object.entries(LIMITS).some(([key, range]) => {
      const value = draft[key as keyof typeof LIMITS] as number;
      return !Number.isInteger(value) || value < range.min || value > range.max;
    }),
  );

  const loadRules = useCallback(async () => {
    if (!auth || !isAuthorized) return;
    setLoadError(null);
    try {
      const stored = await getPastoralBriefingRules(auth);
      const nextRules = toDraft(stored);
      setMetadata(stored);
      setSavedRules(nextRules);
      setDraft(nextRules);
    } catch (error) {
      setLoadError(errorMessage(error, "We could not load Pastoral Briefing Rules."));
    }
  }, [auth, isAuthorized]);

  useEffect(() => {
    if (authLoading || !auth || !isAuthorized) return;
    void loadRules();
  }, [authLoading, auth, isAuthorized, loadRules, loadAttempt]);

  const patch = useCallback(<K extends keyof BriefingRules>(key: K, value: BriefingRules[K]) => {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setPreview(null);
    setPreviewState("idle");
    setOperationError(null);
    setSaveState("idle");
  }, []);

  const handlePreview = useCallback(async () => {
    if (!auth || !draft || hasInvalidValues) return;
    setPreviewState("loading");
    setOperationError(null);
    try {
      const result = await previewPastoralBriefingRules(auth, draft);
      setPreview(result);
      setPreviewState("ready");
    } catch (error) {
      setPreviewState("error");
      setOperationError(errorMessage(error, "We could not preview these rules. Please try again."));
    }
  }, [auth, draft, hasInvalidValues]);

  const handleSave = useCallback(async () => {
    if (!auth || !draft || hasInvalidValues) return;
    setSaveState("saving");
    setOperationError(null);
    try {
      const stored = await savePastoralBriefingRules(auth, draft);
      const nextRules = toDraft(stored);
      setMetadata(stored);
      setSavedRules(nextRules);
      setDraft(nextRules);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setOperationError(errorMessage(error, "We could not save these rules. Please try again."));
    }
  }, [auth, draft, hasInvalidValues]);

  const handleRestore = useCallback(async () => {
    if (!auth) return;
    setShowRestoreConfirm(false);
    setRestoring(true);
    setOperationError(null);
    try {
      const stored = await restorePastoralBriefingDefaults(auth);
      const nextRules = toDraft(stored);
      setMetadata(stored);
      setSavedRules(nextRules);
      setDraft(nextRules);
      setPreview(null);
      setPreviewState("idle");
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setOperationError(errorMessage(error, "We could not restore the recommended defaults."));
    } finally {
      setRestoring(false);
    }
  }, [auth]);

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#f3f7f3] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1180px]"><LoadingState /></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[100dvh] bg-[#f3f7f3] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-[#d8e4dc] bg-[#fbfcf8] p-8 text-center shadow-[0_12px_35px_rgba(46,76,63,0.06)]">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a36842]" />
          <h1 className="mt-4 text-xl font-semibold text-[#26453e]">Sign in to view these settings</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6d817b]">
            Pastoral Briefing Rules are available to authorised church administrators only.
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-[100dvh] bg-[#f3f7f3] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-[#d8e4dc] bg-[#fbfcf8] p-8 text-center shadow-[0_12px_35px_rgba(46,76,63,0.06)]">
          <ShieldCheck className="mx-auto h-10 w-10 text-[#a36842]" />
          <h1 className="mt-4 text-xl font-semibold text-[#26453e]">Administrator access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#6d817b]">
            These rules shape who is surfaced for care. Ask a church administrator if you need access.
          </p>
          <button
            type="button"
            onClick={goBack}
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#cbd9d2] px-4 py-2 text-sm font-medium text-[#315149] transition-colors hover:bg-[#eef5ef]"
          >
            <ArrowLeft size={15} /> Back to Settings
          </button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-[100dvh] bg-[#f3f7f3] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1180px]">
          <button
            type="button"
            onClick={goBack}
            className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-[#607871] transition-colors hover:text-[#26453e]"
          >
            <ArrowLeft size={16} /> Back to Settings
          </button>
          <div className="max-w-xl rounded-2xl border border-[#e4cfc8] bg-[#fdf8f5] p-7">
            <AlertCircle className="h-6 w-6 text-[#a24f3e]" />
            <h1 className="mt-4 text-lg font-semibold text-[#5c3026]">Briefing Rules could not be loaded</h1>
            <p className="mt-2 text-sm leading-relaxed text-[#845d52]">{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt(attempt => attempt + 1)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#28766b] px-4 py-2 text-sm font-semibold text-[#fbfcf8] transition-colors hover:bg-[#1e6259]"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!draft || !savedRules || !metadata) {
    return (
      <div className="min-h-[100dvh] bg-[#f3f7f3] px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1180px]"><LoadingState /></div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#f3f7f3] text-[#26453e]">
      <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#607871] transition-colors hover:text-[#26453e]"
          >
            <ArrowLeft size={16} /> Back to Settings
          </button>
          <div className="flex items-center gap-2 text-xs text-[#71847d]">
            <span className="h-2 w-2 rounded-full bg-[#28766b]" />
            Administration tools <span className="text-[#a1afa9]">/</span> Settings
          </div>
        </div>

        <header className="mb-7 flex flex-col gap-5 border-b border-[#d8e4dc] pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#cbded3] bg-[#e7f1e9] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#28766b]">
              <SlidersHorizontal size={12} /> Today briefing
            </div>
            <h1 className="max-w-2xl text-[28px] font-semibold tracking-[-0.025em] text-[#23443c] sm:text-[34px]">
              Pastoral Briefing Rules
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6d817b]">
              Decide which observable patterns deserve a gentle prompt for attention in Today.
              These settings guide care; they do not label or judge anyone.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <span className="rounded-full border border-[#e4c89c] bg-[#fff8e9] px-3 py-1.5 text-xs font-medium text-[#986b31]">
                Unsaved changes
              </span>
            )}
            {!hasUnsavedChanges && saveState === "saved" && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#28766b]" role="status">
                <CheckCircle2 size={14} /> Changes saved
              </span>
            )}
            <AdminBtn
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!hasUnsavedChanges || hasInvalidValues || saveState === "saving" || restoring}
            >
              {saveState === "saving" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Save rules
            </AdminBtn>
          </div>
        </header>

        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-[#d7e4da] bg-[#eaf3eb] px-4 py-4 sm:px-5">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-[#28766b]" />
          <div>
            <p className="text-sm font-semibold text-[#315149]">A prompt for presence, not a verdict</p>
            <p className="mt-1 text-xs leading-relaxed text-[#607871]">
              Today is evaluated from meaningful activity: persisted progress, starts, completions and
              reflections in Emmaus Walks or Journeys and Daily Devotionals. Admin previews, test fixtures
              and background processes are not meaningful activity.
            </p>
          </div>
        </div>

        {operationError && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#e4cfc8] bg-[#fdf8f5] px-4 py-3.5 text-sm text-[#7f493d]" role="alert">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-[#a24f3e]" />
            <span>{operationError}</span>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="space-y-5">
            <section className="rounded-2xl border border-[#d8e4dc] bg-[#fbfcf8] p-4 shadow-[0_8px_24px_rgba(46,76,63,0.04)] sm:p-5">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f8eadb] text-[#a36842]">
                  <Activity size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#294840]">Patterns to bring into Today</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[#71847d]">
                    Turn a family on, then set the point at which it becomes worth a human look.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <AlertFamily
                  icon={<UsersRound size={18} />}
                  eyebrow="Attendance"
                  title="Missed expected services"
                  description="Surface people who have missed the same number of services they were expected to attend."
                  enabled={draft.attendanceAlertsEnabled}
                  onToggle={() => patch("attendanceAlertsEnabled", !draft.attendanceAlertsEnabled)}
                  disabled={saveState === "saving" || restoring}
                >
                  <NumberField
                    label="Missed services threshold"
                    description="A person appears after this many missed expected services."
                    value={draft.missedServicesThreshold}
                    min={LIMITS.missedServicesThreshold.min}
                    max={LIMITS.missedServicesThreshold.max}
                    suffix="services"
                    disabled={saveState === "saving" || restoring}
                    onChange={value => patch("missedServicesThreshold", value)}
                  />
                </AlertFamily>

                <AlertFamily
                  icon={<Clock3 size={18} />}
                  eyebrow="Emmaus activity"
                  title="Emmaus inactivity"
                  description="Surface linked people whose meaningful Emmaus activity has gone quiet for a while."
                  enabled={draft.emmausInactivityAlertsEnabled}
                  onToggle={() => patch("emmausInactivityAlertsEnabled", !draft.emmausInactivityAlertsEnabled)}
                  disabled={saveState === "saving" || restoring}
                >
                  <NumberField
                    label="Inactivity window"
                    description="A person appears when meaningful activity has not been persisted within this window."
                    value={draft.emmausInactivityDays}
                    min={LIMITS.emmausInactivityDays.min}
                    max={LIMITS.emmausInactivityDays.max}
                    suffix="days"
                    disabled={saveState === "saving" || restoring}
                    onChange={value => patch("emmausInactivityDays", value)}
                  />
                </AlertFamily>

                <AlertFamily
                  icon={<BookOpen size={18} />}
                  eyebrow="Progress"
                  title="Stalled progress"
                  description="Surface started content where progress has stopped, so a leader can consider a timely check-in."
                  enabled={draft.stalledProgressAlertsEnabled}
                  onToggle={() => patch("stalledProgressAlertsEnabled", !draft.stalledProgressAlertsEnabled)}
                  disabled={saveState === "saving" || restoring}
                >
                  <NumberField
                    label="Stalled progress window"
                    description="A person appears when their started, unfinished content has had no meaningful progress for this long."
                    value={draft.stalledProgressDays}
                    min={LIMITS.stalledProgressDays.min}
                    max={LIMITS.stalledProgressDays.max}
                    suffix="days"
                    disabled={saveState === "saving" || restoring}
                    onChange={value => patch("stalledProgressDays", value)}
                  />
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#e5dcc9] bg-[#fffaf0] px-3 py-2.5">
                    <Info size={15} className="mt-0.5 shrink-0 text-[#a36842]" />
                    <p className="text-[11px] leading-relaxed text-[#80694d]">
                      Stalled progress does not include Daily Rhythm, Daily Devotionals or sermon companions.
                      Completed, archived and unstarted content is excluded too.
                    </p>
                  </div>
                </AlertFamily>
              </div>
            </section>

            <section className="rounded-2xl border border-[#d8e4dc] bg-[#fbfcf8] p-4 shadow-[0_8px_24px_rgba(46,76,63,0.04)] sm:p-5">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#e8eef5] text-[#54748d]">
                  <UserRound size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#294840]">People to leave out</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[#71847d]">
                    Keep system records and people outside your care context from entering the briefing.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-[#e3ebe5]">
                <ExclusionRow
                  title="Test accounts"
                  description="Exclude accounts marked as test or fixture records."
                  checked={draft.excludeTestAccounts}
                  onToggle={() => patch("excludeTestAccounts", !draft.excludeTestAccounts)}
                  disabled={saveState === "saving" || restoring}
                />
                <ExclusionRow
                  title="Inactive accounts"
                  description="Exclude removed or otherwise inactive Emmaus accounts."
                  checked={draft.excludeInactiveAccounts}
                  onToggle={() => patch("excludeInactiveAccounts", !draft.excludeInactiveAccounts)}
                  disabled={saveState === "saving" || restoring}
                />
                <ExclusionRow
                  title="Visitors"
                  description="Exclude visitor records until they become part of the regular care context."
                  checked={draft.excludeVisitors}
                  onToggle={() => patch("excludeVisitors", !draft.excludeVisitors)}
                  disabled={saveState === "saving" || restoring}
                />
                <ExclusionRow
                  title="Unlinked profiles"
                  description="Exclude pastoral profiles that are not linked to an Emmaus identity."
                  checked={draft.excludeUnlinkedProfiles}
                  onToggle={() => patch("excludeUnlinkedProfiles", !draft.excludeUnlinkedProfiles)}
                  disabled={saveState === "saving" || restoring}
                />
                <ExclusionRow
                  title="Church administrators"
                  description="Keep administrators out of member-facing care prompts by default."
                  checked={draft.excludeChurchAdministrators}
                  onToggle={() => patch("excludeChurchAdministrators", !draft.excludeChurchAdministrators)}
                  disabled={saveState === "saving" || restoring}
                />
                <ExclusionRow
                  title="Profiles without an active identity"
                  description="Exclude records that cannot currently be connected to an active identity."
                  checked={draft.excludeWithoutActiveIdentity}
                  onToggle={() => patch("excludeWithoutActiveIdentity", !draft.excludeWithoutActiveIdentity)}
                  disabled={saveState === "saving" || restoring}
                />
              </div>
            </section>

            <section className="rounded-2xl border border-[#d8e4dc] bg-[#f7faf6] p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf0e5] text-[#778258]">
                  <ShieldCheck size={18} />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#294840]">New user grace period</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[#71847d]">
                    Give new Emmaus users room to begin before inactivity patterns are considered.
                    Set to zero to evaluate from the day they join.
                  </p>
                  <div className="mt-4 max-w-md">
                    <NumberField
                      label="Grace period"
                      description="New users are not considered for inactivity alerts during this period."
                      value={draft.newUserGracePeriodDays}
                      min={LIMITS.newUserGracePeriodDays.min}
                      max={LIMITS.newUserGracePeriodDays.max}
                      suffix="days"
                      disabled={saveState === "saving" || restoring}
                      onChange={value => patch("newUserGracePeriodDays", value)}
                    />
                  </div>
                </div>
              </div>
            </section>

            <div className="flex flex-col gap-3 border-t border-[#d8e4dc] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => {
                  setDraft(savedRules);
                  setPreview(null);
                  setPreviewState("idle");
                  setOperationError(null);
                  setSaveState("idle");
                }}
                disabled={!hasUnsavedChanges || saveState === "saving" || restoring}
                className="inline-flex items-center justify-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-medium text-[#607871] transition-colors hover:bg-[#e8f0ea] hover:text-[#294840] disabled:pointer-events-none disabled:opacity-40"
              >
                <RotateCcw size={15} /> Discard changes
              </button>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowRestoreConfirm(true)}
                  disabled={restoring || saveState === "saving"}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#cbd9d2] bg-[#fbfcf8] px-3.5 py-2 text-sm font-medium text-[#607871] transition-colors hover:border-[#aebfb6] hover:bg-[#eef5ef] disabled:pointer-events-none disabled:opacity-50"
                >
                  {restoring ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                  Restore recommended defaults
                </button>
                <AdminBtn
                  variant="primary"
                  onClick={() => void handleSave()}
                  disabled={!hasUnsavedChanges || hasInvalidValues || saveState === "saving" || restoring}
                >
                  {saveState === "saving" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                  Save rules
                </AdminBtn>
              </div>
            </div>
          </main>

          <aside className="lg:sticky lg:top-5">
            <section className="overflow-hidden rounded-2xl border border-[#cbded3] bg-[#eef6ef] shadow-[0_10px_28px_rgba(46,76,63,0.06)]">
              <div className="border-b border-[#d7e6da] px-4 py-4 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#28766b]">
                      <Eye size={13} /> Read-only preview
                    </div>
                    <h2 className="mt-2 text-lg font-semibold text-[#294840]">What Today would show</h2>
                  </div>
                  {preview && (
                    <span className="rounded-full bg-[#d8ecdd] px-2.5 py-1 text-sm font-bold text-[#28766b]">
                      {preview.totalFlagged}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#668078]">
                  Preview uses the current draft and does not save, notify, create records or send messages.
                </p>
                <button
                  type="button"
                  onClick={() => void handlePreview()}
                  disabled={previewState === "loading" || hasInvalidValues || restoring}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#28766b] px-3.5 py-2.5 text-sm font-semibold text-[#fbfcf8] transition-colors hover:bg-[#1e6259] disabled:pointer-events-none disabled:opacity-50"
                >
                  {previewState === "loading" ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}
                  {previewState === "loading" ? "Evaluating draft…" : "Preview current draft"}
                </button>
              </div>

              <div className="bg-[#fbfcf8] px-4 py-4 sm:px-5">
                {previewState === "error" && (
                  <div className="rounded-xl border border-[#e4cfc8] bg-[#fdf8f5] px-3 py-3 text-xs leading-relaxed text-[#7f493d]">
                    Preview failed. Check your access and try again.
                  </div>
                )}
                {!preview && previewState !== "error" && (
                  <div className="py-7 text-center">
                    <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#eaf3eb] text-[#28766b]">
                      <Eye size={20} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[#315149]">A considered look before saving</p>
                    <p className="mx-auto mt-1.5 max-w-[16rem] text-xs leading-relaxed text-[#71847d]">
                      Evaluate this draft against the same server-side rules used by Today.
                    </p>
                  </div>
                )}
                {preview && previewState === "ready" && (
                  <>
                    <div className="mb-4 rounded-xl border border-[#d7e4da] bg-[#f5faf4] px-3 py-3">
                      <p className="text-2xl font-semibold tracking-tight text-[#294840]">{preview.totalFlagged}</p>
                      <p className="mt-0.5 text-xs text-[#71847d]">
                        {preview.totalFlagged === 1 ? "person would be surfaced" : "people would be surfaced"}
                      </p>
                    </div>
                    {preview.matches.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[#cbded3] px-4 py-5 text-center">
                        <CheckCircle2 className="mx-auto h-5 w-5 text-[#28766b]" />
                        <p className="mt-2 text-sm font-semibold text-[#315149]">No matches in this evaluation</p>
                        <p className="mt-1 text-xs leading-relaxed text-[#71847d]">
                          That is a useful result, not a problem. Today will stay quiet until the rules find a pattern.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-0">
                        {preview.matches.map(match => (
                          <PreviewMatch key={`${match.personType}-${match.personId}`} match={match} />
                        ))}
                      </div>
                    )}
                    <p className="mt-4 border-t border-[#e3ebe5] pt-3 text-[11px] leading-relaxed text-[#8a9b94]">
                      Evaluated {formatSavedDate(preview.evaluatedAt)} · Read-only result
                    </p>
                  </>
                )}
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-[#d8e4dc] bg-[#fbfcf8] px-4 py-4 sm:px-5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-[#789087]">
                <Clock3 size={14} /> Last saved
              </div>
              <p className="mt-2 text-sm font-semibold text-[#315149]">{formatSavedDate(metadata.updatedAt)}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#71847d]">
                 {metadata.updatedBy ? "Saved by an administrator" : "No administrator recorded"}
                {" · "}
                {metadata.source === "defaults" ? "Recommended defaults" : "Saved rules"}
              </p>
            </section>
          </aside>
        </div>
      </div>

      {showRestoreConfirm && (
        <ConfirmDialog
          title="Restore recommended defaults?"
          message="This will replace the current saved rules on the server and update this form. Any unsaved edits will be discarded."
          confirmLabel="Restore defaults"
          onCancel={() => setShowRestoreConfirm(false)}
          onConfirm={() => void handleRestore()}
        />
      )}
    </div>
  );
}