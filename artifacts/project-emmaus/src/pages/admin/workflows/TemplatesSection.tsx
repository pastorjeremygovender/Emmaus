import React, { useState, useId } from "react";
import { Plus, Trash2, BookTemplate, ChevronDown, ChevronUp, Lock } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, EmptyState } from "./shared";

interface Props {
  auth: api.AuthHeaders;
  templates: api.TaskTemplate[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export function TemplatesSection({ auth, templates, loading, error, onRefresh }: Props) {
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    await api.deleteTemplate(auth, id);
    onRefresh();
  };

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          System templates can't be deleted. You can create custom templates for your church.
        </p>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 flex-shrink-0"
        >
          <Plus size={15} /> New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <EmptyState icon={<BookTemplate />} title="No templates yet" />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              expanded={expanded === t.id}
              onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onDelete={() => handleDelete(t.id)}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateTemplateModal
          auth={auth}
          onSave={() => { setCreating(false); onRefresh(); }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function TemplateCard({
  template,
  expanded,
  onToggle,
  onDelete,
}: {
  template: api.TaskTemplate;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const catColors: Record<string, string> = {
    evangelism: "bg-emerald-50 text-emerald-700",
    pastoral_care: "bg-blue-50 text-blue-700",
    discipleship: "bg-purple-50 text-purple-700",
    prayer: "bg-amber-50 text-amber-700",
    ministry: "bg-teal-50 text-teal-700",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-900">{template.name}</span>
            {template.isSystem && (
              <span className="flex items-center gap-1 text-[10px] text-gray-400">
                <Lock size={10} /> System
              </span>
            )}
            {template.category && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${catColors[template.category] ?? "bg-gray-100 text-gray-500"}`}>
                {template.category.replace(/_/g, " ")}
              </span>
            )}
          </div>
          {template.defaultTitle && (
            <p className="text-xs text-gray-500 mt-0.5">{template.defaultTitle}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!template.isSystem && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-gray-400 hover:text-red-500 p-1 rounded"
            >
              <Trash2 size={14} />
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {template.bibleRef && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Scripture</p>
              <p className="text-sm text-teal-700 italic">{template.bibleRef}</p>
            </div>
          )}
          {template.prayerReminder && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Prayer Reminder</p>
              <p className="text-sm text-gray-700">{template.prayerReminder}</p>
            </div>
          )}
          {template.suggestedQuestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Suggested Questions</p>
              <ul className="space-y-1">
                {template.suggestedQuestions.map((q, i) => (
                  <li key={i} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-gray-400">•</span> {q}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {template.checklist.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1">Checklist</p>
              <ul className="space-y-1">
                {template.checklist.map((c) => (
                  <li key={c.id} className="text-sm text-gray-700 flex gap-2">
                    <span className="text-gray-400">□</span> {c.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateTemplateModal({
  auth,
  onSave,
  onClose,
}: {
  auth: api.AuthHeaders;
  onSave: () => void;
  onClose: () => void;
}) {
  const uid = useId();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [defaultTitle, setDefaultTitle] = useState("");
  const [bibleRef, setBibleRef] = useState("");
  const [prayerReminder, setPrayerReminder] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [checklist, setChecklist] = useState<{ id: string; label: string }[]>([]);
  const [newItem, setNewItem] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    try {
      await api.createTemplate(auth, {
        name, category, defaultTitle, bibleRef, prayerReminder,
        suggestedQuestions: questions.filter(Boolean),
        checklist,
      });
      onSave();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">New Template</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Template Name *</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Visit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">—</option>
                <option value="pastoral_care">Pastoral Care</option>
                <option value="evangelism">Evangelism</option>
                <option value="discipleship">Discipleship</option>
                <option value="prayer">Prayer</option>
                <option value="ministry">Ministry</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Default Title</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={defaultTitle} onChange={(e) => setDefaultTitle(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Scripture Reference</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={bibleRef} onChange={(e) => setBibleRef(e.target.value)} placeholder="e.g. John 3:16" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Prayer Reminder</label>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={prayerReminder} onChange={(e) => setPrayerReminder(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Suggested Questions</label>
            {questions.map((q, i) => (
              <input key={i} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 mb-2"
                value={q} onChange={(e) => {
                  const next = [...questions]; next[i] = e.target.value; setQuestions(next);
                }} placeholder={`Question ${i + 1}`} />
            ))}
            <button onClick={() => setQuestions([...questions, ""])}
              className="text-xs text-teal-700 hover:underline">+ Add question</button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Checklist</label>
            {checklist.map((c) => (
              <div key={c.id} className="flex items-center gap-2 mb-2">
                <span className="text-gray-400 text-sm">□</span>
                <span className="flex-1 text-sm">{c.label}</span>
                <button onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))}
                  className="text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={newItem} onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newItem.trim()) {
                    setChecklist([...checklist, { id: crypto.randomUUID(), label: newItem.trim() }]);
                    setNewItem("");
                  }
                }}
                placeholder="Add item…" />
              <button onClick={() => {
                if (newItem.trim()) {
                  setChecklist([...checklist, { id: crypto.randomUUID(), label: newItem.trim() }]);
                  setNewItem("");
                }
              }} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm">
                <Plus size={14} />
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50">
            {saving ? "Saving…" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
