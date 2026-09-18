import React, { useState, useCallback } from "react";
import { Plus, Filter, Search, CheckSquare, Clock, AlertTriangle } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { StatusBadge, PriorityBadge, SectionLoader, SectionError, EmptyState, relDate, formatDate } from "./shared";
import { TaskModal } from "./TaskModal";

interface Props {
  auth: api.AuthHeaders;
  templates: api.TaskTemplate[];
}

const STATUS_TABS: { label: string; value: api.TaskStatus | "active" | "" }[] = [
  { label: "Active", value: "active" },
  { label: "New", value: "new" },
  { label: "Assigned", value: "assigned" },
  { label: "In Progress", value: "in_progress" },
  { label: "Waiting", value: "waiting" },
  { label: "Completed", value: "completed" },
  { label: "All", value: "" },
];

export function TasksSection({ auth, templates }: Props) {
  const [tasks, setTasks] = useState<api.MinistryTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<api.TaskStatus | "active" | "">( "active");
  const [teamFilter, setTeamFilter] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<api.MinistryTask | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listTasks(auth, {
        status: statusFilter || undefined,
        team: teamFilter || undefined,
      });
      setTasks(data);
      setLoaded(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [auth, statusFilter, teamFilter]);

  // Load on first render and filter changes
  React.useEffect(() => { load(); }, [load]);

  const handleSave = (task: api.MinistryTask) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = task;
        return next;
      }
      return [task, ...prev];
    });
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Archive this task?")) return;
    await api.archiveTask(auth, id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleStatusChange = async (id: string, status: api.TaskStatus) => {
    const task = await api.updateTask(auth, id, { status });
    handleSave(task);
  };

  const filtered = tasks.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.reason.toLowerCase().includes(q) ||
      (t.assignedTo ?? "").toLowerCase().includes(q)
    );
  });

  const overdue = filtered.filter(
    (t) => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) &&
      !["completed", "cancelled"].includes(t.status),
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === tab.value
                  ? "bg-teal-700 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800"
        >
          <Plus size={15} /> New Task
        </button>
      </div>

      {/* Filters row */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-500"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
        >
          <option value="">All teams</option>
          {api.TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle size={15} />
          <span><strong>{overdue.length}</strong> overdue task{overdue.length > 1 ? "s" : ""}</span>
        </div>
      )}

      {/* List */}
      {loading && !loaded ? (
        <SectionLoader />
      ) : error ? (
        <SectionError message={error} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<CheckSquare />}
          title="No tasks found"
          sub="Create a task to start tracking pastoral care."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onEdit={() => setEditing(task)}
              onArchive={() => handleArchive(task.id)}
              onStatusChange={(s) => handleStatusChange(task.id, s)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <TaskModal
        open={creating}
        auth={auth}
        templates={templates}
        onSave={handleSave}
        onClose={() => setCreating(false)}
      />
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

function TaskRow({
  task,
  onEdit,
  onArchive,
  onStatusChange,
}: {
  task: api.MinistryTask;
  onEdit: () => void;
  onArchive: () => void;
  onStatusChange: (s: api.TaskStatus) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue =
    task.dueDate &&
    task.dueDate < today &&
    !["completed", "cancelled"].includes(task.status);

  const doneItems = task.checklist.filter((c) => c.done).length;
  const totalItems = task.checklist.length;

  return (
    <div
      className={`rounded-xl border p-4 bg-white hover:shadow-sm transition-shadow cursor-pointer group ${
        isOverdue ? "border-red-200" : "border-gray-200"
      }`}
      onClick={onEdit}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-medium text-sm text-gray-900 truncate">{task.title}</span>
            <StatusBadge status={task.status} />
            {task.priority !== "normal" && <PriorityBadge priority={task.priority} />}
          </div>
          {task.reason && (
            <p className="text-xs text-gray-500 mb-2 line-clamp-1">{task.reason}</p>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            {task.assignedTo && (
              <span className="flex items-center gap-1">
                <span className="font-medium text-gray-600">{task.assignedTo}</span>
              </span>
            )}
            {task.dueDate && (
              <span className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : ""}`}>
                <Clock size={11} />
                {isOverdue ? "Overdue · " : ""}{formatDate(task.dueDate)}
              </span>
            )}
            {task.team && <span>{task.team}</span>}
            {totalItems > 0 && (
              <span>{doneItems}/{totalItems} steps</span>
            )}
            <span>Created {relDate(task.createdAt)}</span>
          </div>
        </div>

        {/* Quick status change */}
        <div
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <select
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-500"
            value={task.status}
            onChange={(e) => onStatusChange(e.target.value as api.TaskStatus)}
          >
            {(["new","assigned","in_progress","waiting","completed","cancelled"] as api.TaskStatus[]).map((s) => (
              <option key={s} value={s}>{api.STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
