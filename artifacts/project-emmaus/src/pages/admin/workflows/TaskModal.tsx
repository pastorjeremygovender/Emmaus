import React, { useState, useEffect, useId } from "react";
import { X, Plus, Trash2, Check } from "lucide-react";
import * as api from "@/lib/workflows-api";

interface Props {
  open: boolean;
  auth: api.AuthHeaders;
  initial?: Partial<api.MinistryTask>;
  prefillTemplate?: api.TaskTemplate | null;
  templates: api.TaskTemplate[];
  onSave: (task: api.MinistryTask) => void;
  onClose: () => void;
}

const BLANK: Partial<api.MinistryTask> = {
  title: "",
  reason: "",
  source: "manual",
  priority: "normal",
  status: "new",
  notes: "",
  team: "",
  checklist: [],
};

export function TaskModal({ open, auth, initial, prefillTemplate, templates, onSave, onClose }: Props) {
  const uid = useId();
  const [form, setForm] = useState<Partial<api.MinistryTask>>(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setNewItem("");
    if (initial?.id) {
      setForm({ ...BLANK, ...initial });
    } else if (prefillTemplate) {
      setForm({
        ...BLANK,
        title: prefillTemplate.defaultTitle,
        notes: [
          prefillTemplate.prayerReminder ? `Prayer: ${prefillTemplate.prayerReminder}` : "",
          prefillTemplate.bibleRef ? `Scripture: ${prefillTemplate.bibleRef}` : "",
          prefillTemplate.suggestedQuestions.length
            ? `Questions:\n${prefillTemplate.suggestedQuestions.map((q) => `• ${q}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n\n"),
        checklist: prefillTemplate.checklist.map((c) => ({ ...c, done: false })),
      });
    } else {
      setForm(BLANK);
    }
  }, [open, initial, prefillTemplate]);

  const set = (k: keyof api.MinistryTask, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setForm((f) => ({
      ...f,
      title: f.title || t.defaultTitle,
      notes: [
        f.notes,
        t.prayerReminder ? `Prayer: ${t.prayerReminder}` : "",
        t.bibleRef ? `Scripture: ${t.bibleRef}` : "",
        t.suggestedQuestions.length
          ? `Questions:\n${t.suggestedQuestions.map((q) => `• ${q}`).join("\n")}`
          : "",
      ].filter(Boolean).join("\n\n"),
      checklist: t.checklist.map((c) => ({ ...c, done: false })),
    }));
  };

  const addItem = () => {
    if (!newItem.trim()) return;
    const item: api.ChecklistItem = {
      id: crypto.randomUUID(),
      label: newItem.trim(),
      done: false,
    };
    set("checklist", [...(form.checklist ?? []), item]);
    setNewItem("");
  };

  const toggleItem = (id: string) => {
    set(
      "checklist",
      (form.checklist ?? []).map((c) =>
        c.id === id ? { ...c, done: !c.done } : c,
      ),
    );
  };

  const removeItem = (id: string) => {
    set("checklist", (form.checklist ?? []).filter((c) => c.id !== id));
  };

  const handleSave = async () => {
    if (!form.title?.trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      let task: api.MinistryTask;
      if (initial?.id) {
        task = await api.updateTask(auth, initial.id, form);
      } else {
        task = await api.createTask(auth, { ...form, title: form.title! });
      }
      onSave(task);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">
            {initial?.id ? "Edit Task" : "New Ministry Task"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Template picker (only on create) */}
          {!initial?.id && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Apply Template</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                onChange={(e) => applyTemplate(e.target.value)}
                defaultValue=""
              >
                <option value="">— choose a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1" htmlFor={`${uid}-title`}>Title *</label>
            <input
              id={`${uid}-title`}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Visit Jeremy"
            />
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Reason</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.reason ?? ""}
              onChange={(e) => set("reason", e.target.value)}
              placeholder="Why does this task exist?"
            />
          </div>

          {/* Source + Priority + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.source ?? "manual"}
                onChange={(e) => set("source", e.target.value)}
              >
                {(["manual","care_signal","attendance","walk","prayer_request"] as api.TaskSource[]).map((s) => (
                  <option key={s} value={s}>{api.SOURCE_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.priority ?? "normal"}
                onChange={(e) => set("priority", e.target.value as api.TaskPriority)}
              >
                {(["low","normal","high","urgent"] as api.TaskPriority[]).map((p) => (
                  <option key={p} value={p}>{api.PRIORITY_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.status ?? "new"}
                onChange={(e) => set("status", e.target.value as api.TaskStatus)}
              >
                {(["new","assigned","in_progress","waiting","completed","cancelled"] as api.TaskStatus[]).map((s) => (
                  <option key={s} value={s}>{api.STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Assigned leader + Due date + Team */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Assigned Leader</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.assignedTo ?? ""}
                onChange={(e) => set("assignedTo", e.target.value || null)}
                placeholder="Leader name or email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Due Date</label>
              <input
                type="date"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.dueDate ?? ""}
                onChange={(e) => set("dueDate", e.target.value || null)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Ministry Team</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={form.team ?? ""}
              onChange={(e) => set("team", e.target.value)}
            >
              <option value="">— no team —</option>
              {api.TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Linked person (manual ID entry) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Person ID</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.personId ?? ""}
                onChange={(e) => set("personId", e.target.value || null)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Person Type</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={form.personType ?? ""}
                onChange={(e) => set("personType", e.target.value || null)}
              >
                <option value="">—</option>
                <option value="emmaus_user">Emmaus User</option>
                <option value="pastoral_person">Pastoral Person</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              rows={4}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Pastoral notes, suggested questions, scripture encouragement…"
            />
          </div>

          {/* Checklist */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-2">Checklist</label>
            <div className="space-y-2 mb-2">
              {(form.checklist ?? []).map((item) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      item.done
                        ? "bg-teal-600 border-teal-600 text-white"
                        : "border-gray-300 hover:border-teal-400"
                    }`}
                  >
                    {item.done && <Check size={10} />}
                  </button>
                  <span className={`flex-1 text-sm ${item.done ? "line-through text-gray-400" : "text-gray-700"}`}>
                    {item.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addItem())}
                placeholder="Add checklist item…"
              />
              <button
                type="button"
                onClick={addItem}
                className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm flex items-center gap-1"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : initial?.id ? "Save Changes" : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
