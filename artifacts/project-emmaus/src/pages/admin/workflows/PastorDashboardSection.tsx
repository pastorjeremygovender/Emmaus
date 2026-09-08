import React, { useState, useEffect } from "react";
import { AlertTriangle, UserCheck, CheckCircle2, Users, BarChart3 } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, StatusBadge, PriorityBadge, StatCard, EmptyState, relDate, formatDate } from "./shared";
import { TaskModal } from "./TaskModal";

interface Props {
  auth: api.AuthHeaders;
  templates: api.TaskTemplate[];
}

export function PastorDashboardSection({ auth, templates }: Props) {
  const [view, setView] = useState<api.PastorView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<api.MinistryTask | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setView(await api.getPastorView(auth));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = () => load();

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;
  if (!view) return null;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active Tasks" value={view.stats.totalActive} accent="blue" />
        <StatCard label="Unassigned" value={view.stats.totalUnassigned} accent={view.stats.totalUnassigned > 0 ? "amber" : "default"} />
        <StatCard label="Overdue" value={view.stats.totalOverdue} accent={view.stats.totalOverdue > 0 ? "red" : "default"} />
        <StatCard label="Completed (14d)" value={view.recentlyCompleted.length} accent="green" />
      </div>

      {/* Unassigned */}
      {view.unassigned.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-amber-700 flex items-center gap-2 mb-3">
            <UserCheck size={15} /> Unassigned Tasks
            <span className="ml-auto text-xs font-normal text-amber-600">Needs assignment</span>
          </h3>
          <div className="space-y-2">
            {view.unassigned.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={() => setEditing(task)} />
            ))}
          </div>
        </div>
      )}

      {/* Overdue */}
      {view.overdue.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2 mb-3">
            <AlertTriangle size={15} /> Overdue
          </h3>
          <div className="space-y-2">
            {view.overdue.map((task) => (
              <TaskCard key={task.id} task={task} onEdit={() => setEditing(task)} />
            ))}
          </div>
        </div>
      )}

      {/* Leader workload */}
      {view.workloadByLeader.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <BarChart3 size={15} /> Leader Workload
          </h3>
          <div className="space-y-2">
            {view.workloadByLeader.map(({ leader, count }) => (
              <div key={leader} className="flex items-center gap-3 text-sm">
                <span className="text-gray-600 w-40 truncate">{leader}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-teal-600 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (count / Math.max(1, view.stats.totalActive)) * 100)}%` }}
                  />
                </div>
                <span className="text-gray-500 text-xs w-10 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Team workload */}
      {view.workloadByTeam.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Users size={15} /> Ministry Team Workload
          </h3>
          <div className="space-y-2">
            {view.workloadByTeam.map(({ team, count }) => (
              <div key={team} className="flex items-center gap-3 text-sm">
                <span className="text-gray-600 w-40 truncate">{team}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (count / Math.max(1, view.stats.totalActive)) * 100)}%` }}
                  />
                </div>
                <span className="text-gray-500 text-xs w-10 text-right">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently completed */}
      {view.recentlyCompleted.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-emerald-700 flex items-center gap-2 mb-3">
            <CheckCircle2 size={15} /> Recently Completed
          </h3>
          <div className="space-y-2">
            {view.recentlyCompleted.slice(0, 8).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 text-sm text-gray-600 py-2 border-b border-gray-100 last:border-0"
              >
                <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                <span className="flex-1">{task.title}</span>
                <span className="text-xs text-gray-400">{task.assignedTo ?? "—"}</span>
                <span className="text-xs text-gray-400">{relDate(task.updatedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view.allActive.length === 0 && view.recentlyCompleted.length === 0 && (
        <EmptyState
          icon={<CheckCircle2 />}
          title="All clear"
          sub="No active ministry tasks at the moment."
        />
      )}

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

function TaskCard({ task, onEdit }: { task: api.MinistryTask; onEdit: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = task.dueDate && task.dueDate < today;

  return (
    <button
      onClick={onEdit}
      className="w-full text-left rounded-xl border border-gray-200 p-3 bg-white hover:shadow-sm transition-shadow"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm text-gray-900">{task.title}</span>
        <StatusBadge status={task.status} />
        {task.priority !== "normal" && <PriorityBadge priority={task.priority} />}
        <span className="ml-auto text-xs text-gray-400">
          {task.assignedTo ? task.assignedTo : <span className="text-amber-600">Unassigned</span>}
        </span>
        {task.dueDate && (
          <span className={`text-xs ${isOverdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
            {formatDate(task.dueDate)}
          </span>
        )}
      </div>
      {task.reason && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{task.reason}</p>}
    </button>
  );
}
