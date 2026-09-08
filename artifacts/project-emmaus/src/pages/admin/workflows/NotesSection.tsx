import React, { useState, useEffect } from "react";
import { Lock, Plus, FileText } from "lucide-react";
import * as api from "@/lib/workflows-api";
import { SectionLoader, SectionError, EmptyState, relDate } from "./shared";

interface Props {
  auth: api.AuthHeaders;
  personId?: string;
  personType?: string;
  taskId?: string;
  includeConfidential?: boolean;
}

export function NotesSection({ auth, personId, personType, taskId, includeConfidential }: Props) {
  const [notes, setNotes] = useState<api.WorkflowNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [content, setContent] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setNotes(await api.listNotes(auth, { personId, personType, taskId, includeConfidential }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [personId, personType, taskId]);

  const handleAdd = async () => {
    if (!content.trim()) return;
    setSaving(true);
    setSaveError("");
    try {
      const note = await api.createNote(auth, {
        personId, personType, taskId,
        content: content.trim(),
        isConfidential: confidential,
      });
      setNotes((prev) => [note, ...prev]);
      setContent("");
      setConfidential(false);
      setAdding(false);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SectionLoader />;
  if (error) return <SectionError message={error} />;

  return (
    <div className="space-y-4">
      {/* Add note */}
      {adding ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <textarea
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write a pastoral note…"
            autoFocus
          />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confidential}
                onChange={(e) => setConfidential(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-teal-600"
              />
              <Lock size={13} className="text-gray-400" />
              Confidential
            </label>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => { setAdding(false); setContent(""); setSaveError(""); }}
                className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving || !content.trim()}
                className="px-4 py-1.5 rounded-lg bg-teal-700 text-white text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add Note"}
              </button>
            </div>
          </div>
          {confidential && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg p-2">
              Confidential notes are only visible to users with permission.
            </p>
          )}
          {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 text-sm hover:border-teal-400 hover:text-teal-700 w-full justify-center"
        >
          <Plus size={14} /> Add Pastoral Note
        </button>
      )}

      {/* Notes list */}
      {notes.length === 0 ? (
        <EmptyState icon={<FileText />} title="No notes yet" sub="Notes are private, timestamped and immutable." />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`rounded-xl border p-4 ${note.isConfidential ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white"}`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  {note.isConfidential && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                      <Lock size={10} /> Confidential
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{note.authorId}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs text-gray-400">{relDate(note.createdAt)}</span>
                </div>
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
