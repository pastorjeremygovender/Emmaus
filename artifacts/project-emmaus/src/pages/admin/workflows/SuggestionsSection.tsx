import React, { useState, useEffect } from "react";
import { Sparkles, Check, X } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, EmptyState, PriorityBadge } from "./shared";
import { TaskModal } from "./TaskModal";

interface Props {
  auth: api.AuthHeaders;
  templates: api.TaskTemplate[];
}

export function SuggestionsSection({ auth, templates }: Props) {
  const [suggestions, setSuggestions] = useState<api.TaskSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState<api.TaskSuggestion | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setSuggestions(await api.getSignalSuggestions(auth));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const dismiss = (signalId: string) => {
    setDismissed((prev) => new Set([...prev, signalId]));
  };

  const handleSave = (task: api.MinistryTask) => {
    if (creating) dismiss(creating.signalId);
    setCreating(null);
    load();
  };

  const visible = suggestions.filter((s) => !dismissed.has(s.signalId));

  const CATEGORY_COLORS: Record<string, string> = {
    significant: "bg-red-100 text-red-700",
    attention: "bg-orange-100 text-orange-700",
    follow_up: "bg-amber-100 text-amber-800",
    celebration: "bg-emerald-100 text-emerald-700",
    growth: "bg-blue-100 text-blue-700",
  };

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
        <Sparkles size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium mb-1">Suggested from Care Signals</p>
          <p className="text-xs text-amber-700">
            These are suggestions based on open care signals. You decide whether to create a task —
            Emmaus never creates pastoral work automatically.
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="No suggestions right now"
          sub="All open care signals have tasks in progress, or there are no open signals."
        />
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <div key={s.signalId} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-gray-900">{s.suggestedTitle}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[s.category] ?? "bg-gray-100 text-gray-500"}`}>
                      {s.category.replace(/_/g, " ")}
                    </span>
                    <PriorityBadge priority={s.suggestedPriority} />
                  </div>
                  {s.description && (
                    <p className="text-xs text-gray-500 mb-3">{s.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>Person: {s.personType === "emmaus_user" ? "Member" : "Contact"} · {s.personId.slice(0, 8)}…</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setCreating(s)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 text-white text-xs font-medium hover:bg-teal-800"
                >
                  <Check size={12} /> Create Task
                </button>
                <button
                  onClick={() => dismiss(s.signalId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-xs hover:bg-gray-200"
                >
                  <X size={12} /> Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <TaskModal
          open
          auth={auth}
          templates={templates}
          initial={{
            title: creating.suggestedTitle,
            priority: creating.suggestedPriority,
            source: "care_signal",
            personId: creating.personId,
            personType: creating.personType,
            signalId: creating.signalId,
          }}
          onSave={handleSave}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}
