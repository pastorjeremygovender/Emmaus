import React, { useState } from "react";
import { Bookmark, Plus, Trash2, Clock } from "lucide-react";
import { SectionHeader, SectionLoader, SectionError, EmptyState } from "./shared";
import type { SavedReport } from "@/lib/analytics-api";

interface Props {
  data: SavedReport[] | null;
  loading: boolean;
  error?: string;
  onSave: (name: string, description: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const PRESETS = [
  { name: "Sunday Leadership Report", description: "Weekly attendance, walk activity, and care signals for leadership team." },
  { name: "Monthly Elders Report",    description: "Full discipleship analytics, retention funnel, and new believers for monthly elders meeting." },
  { name: "Board Report",             description: "Church health KPIs, growth trends, and pastoral care summary." },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function SavedReportsSection({ data, loading, error, onSave, onDelete }: Props) {
  const [name,  setName]  = useState("");
  const [desc,  setDesc]  = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try { await onSave(name.trim(), desc.trim()); setName(""); setDesc(""); }
    finally { setSaving(false); }
  }

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Bookmark}
        title="Saved Reports"
        subtitle="Save your favourite report configurations for quick access"
        iconColor="text-indigo-500"
      />

      {/* Quick presets */}
      <div className="mb-4">
        <p className="text-[11px] text-gray-500 mb-2 font-medium uppercase tracking-wide">Quick Presets</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => { setName(p.name); setDesc(p.description); }}
              className="text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-indigo-400 text-gray-700 transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Save form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-4">
        <p className="text-[12px] font-semibold text-gray-700 mb-3 flex items-center gap-1.5">
          <Plus size={13} className="text-indigo-500" /> Save Current View
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Report name…"
          className="w-full mb-2 px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Short description (optional)"
          className="w-full mb-3 px-3 py-2 text-[12px] border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
        />
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="px-4 py-2 text-[12px] font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save Report"}
        </button>
      </div>

      {/* Saved list */}
      {loading ? (
        <SectionLoader />
      ) : error ? (
        <SectionError msg={error} />
      ) : !data || data.length === 0 ? (
        <EmptyState message="No saved reports yet. Save a report above." />
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {data.map((r) => (
            <div
              key={r.id}
              className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100 last:border-b-0"
            >
              <div>
                <p className="text-[13px] font-medium text-gray-900">{r.name}</p>
                {r.description && <p className="text-[11px] text-gray-500 mt-0.5">{r.description}</p>}
                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                  <Clock size={9} /> {fmtDate(r.createdAt)}
                </p>
              </div>
              <button
                onClick={() => onDelete(r.id)}
                className="p-1.5 text-gray-300 hover:text-red-500 transition-colors mt-0.5 shrink-0"
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
