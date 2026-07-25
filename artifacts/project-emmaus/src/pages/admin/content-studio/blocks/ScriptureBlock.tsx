import React, { useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import type { ScriptureContent } from '@/lib/blocks';
import { getApiUrl } from '@/lib/api';

interface Props {
  content: ScriptureContent;
  onChange: (c: ScriptureContent) => void;
}

const TRANSLATIONS = ['NIV', 'ESV', 'KJV', 'NKJV', 'NLT', 'CSB'];

export default function ScriptureBlock({ content, onChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchVerse = async () => {
    if (!content.reference.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        getApiUrl(`/api/bible/passage?ref=${encodeURIComponent(content.reference)}&translation=${content.translation ?? 'NIV'}`)
      );
      if (res.ok) {
        const data = await res.json();
        onChange({ ...content, text: data.text ?? data.passage ?? '' });
      } else {
        setError('Passage not found');
      }
    } catch {
      setError('Could not fetch passage');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-teal-100/60 border-b border-teal-200">
        <BookOpen size={14} className="text-teal-600 flex-shrink-0" />
        <input
          type="text"
          value={content.reference}
          onChange={e => onChange({ ...content, reference: e.target.value })}
          onBlur={fetchVerse}
          placeholder="e.g. John 3:16"
          className="flex-1 bg-transparent outline-none text-sm font-semibold text-teal-800 placeholder-teal-400"
        />
        <select
          value={content.translation ?? 'NIV'}
          onChange={e => onChange({ ...content, translation: e.target.value })}
          className="text-[11px] bg-teal-100 border border-teal-300 rounded px-1.5 py-0.5 text-teal-700"
        >
          {TRANSLATIONS.map(t => <option key={t}>{t}</option>)}
        </select>
        <button
          onClick={fetchVerse}
          disabled={loading || !content.reference.trim()}
          className="text-[11px] text-teal-600 hover:text-teal-800 font-medium disabled:opacity-40 flex items-center gap-1"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : '↻ Fetch'}
        </button>
      </div>
      <div className="px-3 py-2.5">
        <textarea
          value={content.text ?? ''}
          onChange={e => onChange({ ...content, text: e.target.value })}
          placeholder="Verse text will appear here after fetching, or type it manually…"
          rows={3}
          className="w-full bg-transparent outline-none text-[14px] text-gray-700 leading-relaxed italic resize-none placeholder-gray-300"
          onInput={e => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = 'auto';
            t.style.height = t.scrollHeight + 'px';
          }}
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  );
}
