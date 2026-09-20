/**
 * PastoralWorkflows — Checkpoint 7 admin section.
 *
 * Tabs:
 *  1. Tasks          — full task list
 *  2. My Tasks       — leader's own view (today/tomorrow/overdue/upcoming)
 *  3. Pastor View    — full overview: unassigned, overdue, workload
 *  4. Suggestions    — care signal → task suggestions
 *  5. Calendar       — monthly calendar of due tasks
 *  6. Templates      — reusable task templates
 *  7. Notes          — standalone pastoral notes
 *  8. Search         — across tasks + notes
 *  9. Reports        — completion stats
 */
import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  CheckSquare, User, Eye, Sparkles, CalendarDays,
  BookTemplate, FileText, Search, BarChart3,
} from "lucide-react";
import * as api from "@/lib/workflows-api";
import { TasksSection } from "./workflows/TasksSection";
import { LeaderDashboardSection } from "./workflows/LeaderDashboardSection";
import { PastorDashboardSection } from "./workflows/PastorDashboardSection";
import { SuggestionsSection } from "./workflows/SuggestionsSection";
import { CalendarSection } from "./workflows/CalendarSection";
import { TemplatesSection } from "./workflows/TemplatesSection";
import { NotesSection } from "./workflows/NotesSection";
import { SearchSection } from "./workflows/SearchSection";
import { ReportsSection } from "./workflows/ReportsSection";
import { SectionLoader } from "./workflows/shared";

type Tab =
  | "tasks"
  | "my-tasks"
  | "pastor-view"
  | "suggestions"
  | "calendar"
  | "templates"
  | "notes"
  | "search"
  | "reports";

const TABS: { id: Tab; label: string; Icon: React.ElementType }[] = [
  { id: "tasks",       label: "Tasks",       Icon: CheckSquare },
  { id: "my-tasks",    label: "My Tasks",    Icon: User },
  { id: "pastor-view", label: "Pastor View", Icon: Eye },
  { id: "suggestions", label: "Suggestions", Icon: Sparkles },
  { id: "calendar",    label: "Calendar",    Icon: CalendarDays },
  { id: "templates",   label: "Templates",   Icon: BookTemplate },
  { id: "notes",       label: "Notes",       Icon: FileText },
  { id: "search",      label: "Search",      Icon: Search },
  { id: "reports",     label: "Reports",     Icon: BarChart3 },
];

export function PastoralWorkflows() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("tasks");
  const [templates, setTemplates] = useState<api.TaskTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");

  const auth: api.AuthHeaders = {
    "x-user-id": user?.id ?? "",
    "x-user-role": user?.role ?? "admin",
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    setTemplatesError("");
    try {
      setTemplates(await api.listTemplates(auth));
    } catch (e) {
      setTemplatesError(String(e));
    } finally {
      setTemplatesLoading(false);
    }
  };

  useEffect(() => { loadTemplates(); }, []);

  const renderContent = () => {
    switch (tab) {
      case "tasks":
        return <TasksSection auth={auth} templates={templates} />;
      case "my-tasks":
        return <LeaderDashboardSection auth={auth} templates={templates} />;
      case "pastor-view":
        return <PastorDashboardSection auth={auth} templates={templates} />;
      case "suggestions":
        return <SuggestionsSection auth={auth} templates={templates} />;
      case "calendar":
        return <CalendarSection auth={auth} templates={templates} />;
      case "templates":
        return (
          <TemplatesSection
            auth={auth}
            templates={templates}
            loading={templatesLoading}
            error={templatesError}
            onRefresh={loadTemplates}
          />
        );
      case "notes":
        return <NotesSection auth={auth} />;
      case "search":
        return <SearchSection auth={auth} />;
      case "reports":
        return <ReportsSection auth={auth} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 lg:px-8 pt-6 pb-0 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Ministry Workflows</h1>
        <p className="text-sm text-gray-500 mb-5">
          Turn care signals into real pastoral care — notice, assign, remember, follow through.
        </p>

        {/* Tab nav */}
        <div className="flex gap-1 overflow-x-auto pb-px scrollbar-hide">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                tab === id
                  ? "bg-teal-700 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab border */}
        <div className="border-b border-gray-200 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 lg:px-8 py-6">
        {renderContent()}
      </div>
    </div>
  );
}
