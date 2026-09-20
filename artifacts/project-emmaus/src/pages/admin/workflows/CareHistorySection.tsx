/**
 * CareHistorySection — displays ministry tasks completed for a specific person.
 * Used on PersonPage to show the full care history.
 */
import React, { useState, useEffect } from "react";
import { CheckCircle2, Clock, FileText } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, EmptyState, StatusBadge, PriorityBadge, relDate, formatDate } from "./shared";

interface Props {
  auth: api.AuthHeaders;
  personId: string;
  personType: string;
}

export function CareHistorySection({ auth, personId, personType }: Props) {
  const [tasks, setTasks] = useState<api.MinistryTask[]>([]);
  const [notes, setNotes] = useState<api.WorkflowNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.listTasks(auth, { personId, personType }),
      api.listNotes(auth, { personId, personType }),
    ])
      .then(([t, n]) => { setTasks(t); setNotes(n); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [personId, personType]);

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;

  // Merge and sort by date
  type FeedItem =
    | { kind: "task"; data: api.MinistryTask; date: string }
    | { kind: "note"; data: api.WorkflowNote; date: string };

  const feed: FeedItem[] = [
    ...tasks.map((t) => ({ kind: "task" as const, data: t, date: t.updatedAt })),
    ...notes.map((n) => ({ kind: "note" as const, data: n, date: n.createdAt })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (feed.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 />}
        title="No care history yet"
        sub="Tasks and notes for this person will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {feed.map((item, i) => {
        if (item.kind === "task") {
          const task = item.data;
          return (
            <div key={`task-${task.id}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  task.status === "completed" ? "bg-emerald-100 text-emerald-600" :
                  task.status === "cancelled" ? "bg-gray-100 text-gray-400" :
                  "bg-blue-100 text-blue-600"
                }`}>
                  <CheckCircle2 size={15} />
                </div>
                {i < feed.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-gray-900">{task.title}</span>
                  <StatusBadge status={task.status} />
                  {task.priority !== "normal" && <PriorityBadge priority={task.priority} />}
                </div>
                <div className="flex gap-3 text-xs text-gray-400 flex-wrap">
                  {task.assignedTo && <span>{task.assignedTo}</span>}
                  {task.dueDate && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> {formatDate(task.dueDate)}
                    </span>
                  )}
                  <span>{relDate(task.createdAt)}</span>
                </div>
                {task.reason && <p className="text-xs text-gray-500 mt-1">{task.reason}</p>}
                {task.checklist.length > 0 && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {task.checklist.map((c) => (
                      <span key={c.id} className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.done ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                        {c.done ? "✓ " : "○ "}{c.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        }

        const note = item.data;
        return (
          <div key={`note-${note.id}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                <FileText size={14} />
              </div>
              {i < feed.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
            </div>
            <div className="flex-1 pb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500 font-medium">Pastoral Note</span>
                <span className="text-xs text-gray-400">{note.authorId}</span>
                <span className="text-xs text-gray-400">{relDate(note.createdAt)}</span>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
