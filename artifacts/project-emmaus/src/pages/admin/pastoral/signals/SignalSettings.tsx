/**
 * SignalSettings.tsx — Per-church signal rule configuration (Task 380).
 *
 * Admins can toggle any of the 18 rules on or off.
 * SuperAdmins can also adjust numeric thresholds per-rule.
 *
 * Rules are grouped by category and displayed with their description.
 * State-based rules show a "resolves automatically" badge.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings, Loader2, AlertCircle, CheckCircle2,
  Trophy, TrendingUp, AlertTriangle, PhoneCall, Star,
  ToggleLeft, ToggleRight, SlidersHorizontal,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

// ─── Category metadata ─────────────────────────────────────────────────────────

const CAT_META: Record<api.SignalCategory, {
  label: string;
  Icon: React.ElementType;
  iconColor: string;
  bg: string;
  border: string;
}> = {
  celebration: { label: 'Celebration',  Icon: Trophy,         iconColor: 'text-green-500',  bg: 'bg-green-50',  border: 'border-green-200' },
  growth:      { label: 'Growth',       Icon: TrendingUp,     iconColor: 'text-teal-500',   bg: 'bg-teal-50',   border: 'border-teal-200' },
  attention:   { label: 'Attention',    Icon: AlertTriangle,  iconColor: 'text-amber-500',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  follow_up:   { label: 'Follow-up',    Icon: PhoneCall,      iconColor: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
  significant: { label: 'Significant',  Icon: Star,           iconColor: 'text-rose-500',   bg: 'bg-rose-50',   border: 'border-rose-200' },
};

const CATEGORY_ORDER: api.SignalCategory[] = [
  'significant', 'follow_up', 'attention', 'growth', 'celebration',
];

// ─── Threshold row ─────────────────────────────────────────────────────────────

interface ThresholdRowProps {
  def: api.ThresholdDef;
  value: number;
  onChange: (key: string, value: number) => void;
}

function ThresholdRow({ def, value, onChange }: ThresholdRowProps) {
  const [raw, setRaw] = useState(String(value));

  useEffect(() => { setRaw(String(value)); }, [value]);

  const commit = () => {
    const n = parseInt(raw, 10);
    if (!isNaN(n) && n >= def.min && n <= def.max) {
      onChange(def.key, n);
    } else {
      setRaw(String(value)); // revert
    }
  };

  return (
    <div className="flex items-center gap-3 mt-2 pl-1">
      <label className="text-[11px] text-gray-500 w-40 shrink-0">{def.label}</label>
      <input
        type="number"
        value={raw}
        min={def.min}
        max={def.max}
        step={1}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="w-20 px-2 py-1 text-[12px] border border-gray-200 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
      />
      <span className="text-[11px] text-gray-400">(default {def.default}, range {def.min}–{def.max})</span>
    </div>
  );
}

// ─── Rule row ─────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: api.SignalRuleWithConfig;
  isSuperAdmin: boolean;
  saving: boolean;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onThresholdChange: (ruleId: string, key: string, value: number) => void;
}

function RuleRow({ rule, isSuperAdmin, saving, onToggle, onThresholdChange }: RuleRowProps) {
  const [showThresholds, setShowThresholds] = useState(false);
  const hasThresholds = isSuperAdmin && rule.thresholdDefs && rule.thresholdDefs.length > 0;

  const effectiveThreshold = (key: string, def: api.ThresholdDef): number =>
    rule.thresholds?.[key] ?? def.default;

  return (
    <div className={`rounded-xl border ${rule.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'} transition-colors`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Toggle */}
        <button
          disabled={saving}
          onClick={() => onToggle(rule.id, !rule.enabled)}
          aria-label={rule.enabled ? `Disable ${rule.title}` : `Enable ${rule.title}`}
          className="mt-0.5 shrink-0 disabled:opacity-50"
        >
          {rule.enabled
            ? <ToggleRight size={22} className="text-teal-600" />
            : <ToggleLeft  size={22} className="text-gray-300" />}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[13px] font-semibold ${rule.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
              {rule.title}
            </span>
            {rule.isStateBased && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600">
                auto-resolves
              </span>
            )}
            {!rule.defaultEnabled && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                off by default
              </span>
            )}
          </div>
          <p className={`text-[12px] mt-0.5 leading-relaxed ${rule.enabled ? 'text-gray-500' : 'text-gray-400'}`}>
            {rule.description}
          </p>

          {/* Threshold controls (superAdmin only) */}
          {hasThresholds && (
            <div className="mt-1.5">
              <button
                onClick={() => setShowThresholds((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-700"
              >
                <SlidersHorizontal size={11} />
                {showThresholds ? 'Hide thresholds' : 'Adjust thresholds'}
              </button>
              {showThresholds && rule.thresholdDefs && (
                <div className="mt-1 space-y-1">
                  {rule.thresholdDefs.map((def) => (
                    <ThresholdRow
                      key={def.key}
                      def={def}
                      value={effectiveThreshold(def.key, def)}
                      onChange={(key, val) => onThresholdChange(rule.id, key, val)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Category section ─────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: api.SignalCategory;
  rules: api.SignalRuleWithConfig[];
  isSuperAdmin: boolean;
  savingId: string | null;
  onToggle: (ruleId: string, enabled: boolean) => void;
  onThresholdChange: (ruleId: string, key: string, value: number) => void;
}

function CategorySection({
  category, rules, isSuperAdmin, savingId, onToggle, onThresholdChange
}: CategorySectionProps) {
  const meta = CAT_META[category];
  const Icon = meta.Icon;
  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${meta.bg} ${meta.border} border`}>
        <Icon size={13} className={meta.iconColor} />
        <span className="text-[12px] font-semibold text-gray-700">{meta.label}</span>
        <span className="ml-auto text-[11px] text-gray-500">
          {enabledCount} / {rules.length} active
        </span>
      </div>
      <div className="space-y-2 pl-1">
        {rules.map((rule) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            isSuperAdmin={isSuperAdmin}
            saving={savingId === rule.id}
            onToggle={onToggle}
            onThresholdChange={onThresholdChange}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

export default function SignalSettings() {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };
  const isSuperAdmin = user?.role === 'superAdmin';

  const [rules,     setRules]     = useState<api.SignalRuleWithConfig[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [savingId,  setSavingId]  = useState<string | null>(null);
  const [savedId,   setSavedId]   = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await api.listSignalRuleConfig(auth);
      setRules(data);
    } catch {
      setError('Could not load signal settings.');
    } finally {
      setLoading(false);
    }
  }, [auth.userId]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (ruleId: string, enabled: boolean) => {
    setSavingId(ruleId); setSaveError('');
    // Optimistic update
    setRules((prev) =>
      prev.map((r) => r.id === ruleId ? { ...r, enabled } : r)
    );
    try {
      const rule = rules.find((r) => r.id === ruleId);
      await api.updateSignalRuleConfig(auth, ruleId, {
        enabled,
        thresholds: rule?.thresholds ?? {},
      });
      setSavedId(ruleId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err: unknown) {
      // Revert on failure
      setRules((prev) =>
        prev.map((r) => r.id === ruleId ? { ...r, enabled: !enabled } : r)
      );
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingId(null);
    }
  };

  const handleThresholdChange = async (ruleId: string, key: string, value: number) => {
    setSavingId(ruleId); setSaveError('');
    const prev = rules.find((r) => r.id === ruleId);
    const newThresholds = { ...(prev?.thresholds ?? {}), [key]: value };
    setRules((rs) =>
      rs.map((r) => r.id === ruleId ? { ...r, thresholds: newThresholds } : r)
    );
    try {
      await api.updateSignalRuleConfig(auth, ruleId, {
        enabled: prev?.enabled ?? true,
        thresholds: newThresholds,
      });
      setSavedId(ruleId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err: unknown) {
      // Revert
      setRules((rs) =>
        rs.map((r) => r.id === ruleId ? { ...r, thresholds: prev?.thresholds ?? {} } : r)
      );
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingId(null);
    }
  };

  // Group rules by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    rules: rules.filter((r) => r.category === cat),
  })).filter((g) => g.rules.length > 0);

  const enabledTotal = rules.filter((r) => r.enabled).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2">
          <Settings size={16} className="text-teal-600" />
          <h2 className="text-[15px] font-semibold text-gray-900">Signal Settings</h2>
          {!loading && (
            <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 text-[11px] font-semibold">
              {enabledTotal} / {rules.length} active
            </span>
          )}
        </div>
        {saveError && (
          <span className="flex items-center gap-1 text-[12px] text-rose-600">
            <AlertCircle size={13} /> {saveError}
          </span>
        )}
        {savedId && !saveError && (
          <span className="flex items-center gap-1 text-[12px] text-green-600">
            <CheckCircle2 size={13} /> Saved
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={20} className="animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-rose-600 text-[13px] py-10 justify-center">
            <AlertCircle size={16} /> {error}
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            {/* Intro text */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-[12px] text-gray-500 leading-relaxed">
              Toggle rules on or off to control which discipleship signals the engine generates for
              your church. Disabled rules are skipped when the engine runs.
              {isSuperAdmin && (
                <> SuperAdmin accounts can also adjust numeric thresholds (e.g. how many missed
                services triggers a follow-up signal).</>
              )}
            </div>

            {grouped.map(({ category, rules: catRules }) => (
              <CategorySection
                key={category}
                category={category}
                rules={catRules}
                isSuperAdmin={isSuperAdmin}
                savingId={savingId}
                onToggle={handleToggle}
                onThresholdChange={handleThresholdChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
