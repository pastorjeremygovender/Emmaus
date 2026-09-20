import React, { useState } from "react";
import { Download, FileText, Table2, Printer } from "lucide-react";
import { SectionHeader } from "./shared";

interface ExportRow {
  [key: string]: string | number;
}

function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => JSON.stringify(r[h] ?? "")).join(",")),
  ];
  return lines.join("\n");
}

function downloadCsv(filename: string, rows: ExportRow[]) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  allData: {
    kpis: Record<string, number | string> | null;
    attendance: { weekly: unknown[] } | null;
    discipleship: { walkStats: unknown[] } | null;
    rooms: { rooms: unknown[] } | null;
  };
}

type ReportType = "weekly" | "monthly" | "quarterly" | "yearly";

const REPORT_LABELS: Record<ReportType, string> = {
  weekly:    "Weekly Summary",
  monthly:   "Monthly Summary",
  quarterly: "Quarterly Summary",
  yearly:    "Yearly Summary",
};

export function ExportsSection({ allData }: Props) {
  const [generating, setGenerating] = useState<string | null>(null);

  function handleExport(type: ReportType) {
    setGenerating(type);
    try {
      const rows: ExportRow[] = [];

      if (allData.kpis) {
        for (const [key, val] of Object.entries(allData.kpis)) {
          rows.push({ section: "Church Health", metric: key, value: val });
        }
      }

      if (allData.discipleship?.walkStats) {
        for (const w of allData.discipleship.walkStats as any[]) {
          rows.push({
            section: "Discipleship",
            metric: `Walk: ${w.title}`,
            value: `${w.starts} started, ${w.completions} completed, ${w.avgCompletionPct}% avg`,
          });
        }
      }

      const date = new Date().toISOString().split("T")[0];
      downloadCsv(`emmaus-${type}-report-${date}.csv`, rows.length > 0 ? rows : [{ note: "No data available" }]);
    } finally {
      setGenerating(null);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <section className="mb-10">
      <SectionHeader
        icon={Download}
        title="Exports"
        subtitle="Download reports as CSV or print a summary"
        iconColor="text-gray-500"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {(["weekly", "monthly", "quarterly", "yearly"] as ReportType[]).map((type) => (
          <button
            key={type}
            onClick={() => handleExport(type)}
            disabled={!!generating}
            className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-col items-start gap-2 hover:border-teal-400 hover:shadow-sm transition-all disabled:opacity-50"
          >
            <Table2 size={16} className="text-teal-600" />
            <div>
              <p className="text-[12px] font-semibold text-gray-800">{REPORT_LABELS[type]}</p>
              <p className="text-[10px] text-gray-400">CSV • {generating === type ? "Generating…" : "Click to download"}</p>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={handlePrint}
        className="flex items-center gap-2 text-[12px] text-gray-600 border border-gray-200 rounded-xl px-4 py-2.5 bg-white hover:border-gray-400 transition-colors"
      >
        <Printer size={14} />
        Print-friendly view
      </button>
    </section>
  );
}
