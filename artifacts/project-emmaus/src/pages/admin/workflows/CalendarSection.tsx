import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, EmptyState, PriorityBadge, StatusBadge } from "./shared";
import { TaskModal } from "./TaskModal";

interface Props {
  auth: api.AuthHeaders;
  templates: api.TaskTemplate[];
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function CalendarSection({ auth, templates }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [events, setEvents] = useState<api.CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<api.MinistryTask | null>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = daysInMonth(year, month);
      const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      setEvents(await api.getCalendarEvents(auth, from, to));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };

  const eventsForDay = (d: number): api.CalendarEvent[] => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return events.filter((e) => e.date === dateStr);
  };

  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const days = daysInMonth(year, month);
  const firstDay = firstDayOfMonth(year, month);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const selectedEvents = selected
    ? events.filter((e) => e.date === selected)
    : [];

  const openEditTask = async (id: string) => {
    try {
      const task = await api.getTask(auth, id);
      setEditingTask(task);
    } catch { /* ignore */ }
  };

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <ChevronLeft size={18} />
        </button>
        <h3 className="font-semibold text-gray-900">{MONTH_NAMES[month]} {year}</h3>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-2">{d}</div>
          ))}
        </div>

        {/* Weeks */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-gray-100 bg-gray-50/40 last:border-r-0" />
          ))}

          {Array.from({ length: days }).map((_, i) => {
            const d = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dayEvents = eventsForDay(d);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selected;

            return (
              <div
                key={d}
                onClick={() => setSelected(isSelected ? null : dateStr)}
                className={`min-h-[80px] border-b border-r border-gray-100 last:border-r-0 p-1.5 cursor-pointer transition-colors ${
                  isSelected ? "bg-teal-50" : "hover:bg-gray-50"
                } ${(i + firstDay + 1) % 7 === 0 ? "border-r-0" : ""}`}
              >
                <div className="flex justify-end mb-1">
                  <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? "bg-teal-700 text-white" : "text-gray-600"
                  }`}>
                    {d}
                  </span>
                </div>
                {dayEvents.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className={`text-[10px] px-1.5 py-0.5 rounded mb-1 truncate font-medium ${
                      ev.priority === "urgent" ? "bg-red-100 text-red-700" :
                      ev.priority === "high" ? "bg-orange-100 text-orange-700" :
                      "bg-teal-100 text-teal-800"
                    }`}
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[10px] text-gray-400">+{dayEvents.length - 2} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day events */}
      {selected && selectedEvents.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">
            {new Date(selected + "T12:00:00").toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })}
          </h4>
          {selectedEvents.map((ev) => (
            <button
              key={ev.id}
              onClick={() => openEditTask(ev.id)}
              className="w-full text-left rounded-xl border border-gray-200 bg-white p-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-gray-900">{ev.title}</span>
                <StatusBadge status={ev.status} />
                <PriorityBadge priority={ev.priority} />
                {ev.assignedTo && <span className="text-xs text-gray-500">{ev.assignedTo}</span>}
                {ev.team && <span className="text-xs text-gray-400">{ev.team}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {events.length === 0 && (
        <EmptyState icon={<CalendarDays />} title="No events this month" sub="Tasks with due dates appear here." />
      )}

      {editingTask && (
        <TaskModal
          open
          auth={auth}
          initial={editingTask}
          templates={templates}
          onSave={() => { setEditingTask(null); load(); }}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
