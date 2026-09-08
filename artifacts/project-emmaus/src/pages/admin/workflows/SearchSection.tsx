import React, { useState, useRef } from "react";
import { Search, FileText, CheckSquare } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, StatusBadge, relDate } from "./shared";

interface Props {
  auth: api.AuthHeaders;
}

export function SearchSection({ auth }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<api.SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        setResults(await api.searchWorkflows(auth, q));
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, 350);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          placeholder="Search tasks, notes, follow-ups…"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          autoFocus
        />
      </div>

      {loading && <SectionLoader />}

      {!loading && searched && results.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">No results found for "{query}"</p>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">{results.length} result{results.length > 1 ? "s" : ""}</p>
          {results.map((r) => (
            <div key={`${r.kind}-${r.id}`} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex-shrink-0 ${r.kind === "task" ? "text-teal-600" : "text-amber-600"}`}>
                  {r.kind === "task" ? <CheckSquare size={16} /> : <FileText size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-sm text-gray-900">{r.title}</span>
                    {r.status && <StatusBadge status={r.status as api.TaskStatus} />}
                    <span className="text-xs text-gray-400 ml-auto">{relDate(r.createdAt)}</span>
                  </div>
                  {r.excerpt && (
                    <p className="text-xs text-gray-500 line-clamp-2">{r.excerpt}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!searched && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Search size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Search across tasks, notes and follow-ups</p>
        </div>
      )}
    </div>
  );
}
