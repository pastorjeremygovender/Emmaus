import React, { useState, useEffect } from "react";
import { CheckSquare, AlertTriangle, Clock, CalendarDays, Inbox } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, StatusBadge, PriorityBadge, StatCard, EmptyState, formatDate } from "./shared";
import { TaskModal } from "./TaskModal";

interface Props {
  auth: api.AuthHeaders;
  templates: api.TaskTemplate[];
}

export function LeaderDashboardSection({ auth, templates }: Props) {
  const [view, setView] = useState<api.LeaderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<api.MinistryTask | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setView(await api.getLeaderView(auth));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = (task: api.MinistryTask) => {
    load(); // refresh view
  };

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;
  if (!view) return null;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="My Tasks" value={view.myTasks.length} />
        <StatCard label="Overdue" value={view.overdue.length} accent={view.overdue.length > 0 ? "red" : "default"} />
        <StatCard label="Due Today" value={view.dueToday.length} accent={view.dueToday.length > 0 ? "amber" : "default"} />
        <StatCard label="Due Tomorrow" value={view.dueTomorrow.length} />
      </div>

      {/* Overdue */}
      {view.overdue.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-3">
            <AlertTriangle size={15} /> Overdue
          </h3>
          <TaskList tasks={view.overdue} onEdit={setEditing} />
        </div>
      )}

      {/* Due Today */}
      {view.dueToday.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2 mb-3">
            <CalendarDays size={15} /> Today's Agenda
          </h3>
          <TaskList tasks={view.dueToday} onEdit={setEditing} />
        </div>
      )}

      {/* Due Tomorrow */}
      {view.dueTomorrow.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Clock size={15} /> Tomorrow
          </h3>
          <TaskList tasks={view.dueTomorrow} onEdit={setEditing} />
        </div>
      )}

      {/* Upcoming */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
          <Inbox size={15} /> Upcoming
        </h3>
        {view.upcoming.length === 0 ? (
          <EmptyState icon={<CheckSquare />} title="No upcoming tasks" sub="You're all caught up." />
        ) : (
          <TaskList tasks={view.upcoming} onEdit={setEditing} />
        )}
      </div>

      <TaskModal
        open={!!editing}
        auth={auth}
        initial={editing ?? undefined}
        templates={templates}
        onSave={handleSave}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function TaskList({ tasks, onEdit }: { tasks: api.MinistryTask[]; onEdit: (t: api.MinistryTask) => void }) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <button
          key={task.id}
          onClick={() => onEdit(task)}
          className="w-full text-left rounded-xl border border-gray-200 p-4 bg-white hover:shadow-sm transition-shadow"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-medium text-sm text-gray-900">{task.title}</span>
                <StatusBadge status={task.status} />
                {task.priority !== "normal" && <PriorityBadge priority={task.priority} />}
              </div>
              {task.reason && <p className="text-xs text-gray-500 line-clamp-1">{task.reason}</p>}
            </div>
            {task.dueDate && (
              <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(task.dueDate)}</span>
            )}
          </div>
          {task.checklist.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {task.checklist.slice(0, 4).map((c) => (
                <span
                  key={c.id}
                  className={`text-xs px-2 py-0.5 rounded-full ${c.done ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}
                >
                  {c.done ? "✓ " : "○ "}{c.label}
                </span>
              ))}
              {task.checklist.length > 4 && (
                <span className="text-xs text-gray-400">+{task.checklist.length - 4} more</span>
              )}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
