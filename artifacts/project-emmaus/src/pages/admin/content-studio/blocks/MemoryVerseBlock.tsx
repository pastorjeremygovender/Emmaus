import React, { useRef } from 'react';
import type { MemoryVerseContent } from '@/lib/blocks';

interface Props {
  content: MemoryVerseContent;
  onChange: (c: MemoryVerseContent) => void;
}

const TRANSLATIONS = ['NIV', 'ESV', 'KJV', 'NKJV', 'NLT'];

export default function MemoryVerseBlock({ content, onChange }: Props) {
  const resize = (ref: HTMLTextAreaElement | null) => {
    if (ref) { ref.style.height = 'auto'; ref.style.height = ref.scrollHeight + 'px'; }
  };
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-yellow-100/60 border-b border-yellow-200">
        <span className="text-sm">⭐</span>
        <span className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">Memory Verse</span>
        <input
          type="text"
          value={content.reference}
          onChange={e => onChange({ ...content, reference: e.target.value })}
          placeholder="John 3:16"
          className="flex-1 bg-transparent outline-none text-xs font-semibold text-yellow-800 placeholder-yellow-400 ml-2"
        />
        <select
          value={content.translation ?? 'NIV'}
          onChange={e => onChange({ ...content, translation: e.target.value })}
          className="text-[11px] bg-yellow-100 border border-yellow-300 rounded px-1.5 py-0.5 text-yellow-700"
        >
          {TRANSLATIONS.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="px-3 py-2.5">
        <textarea
          value={content.text}
          onChange={e => { onChange({ ...content, text: e.target.value }); resize(e.target); }}
          onInput={e => resize(e.target as HTMLTextAreaElement)}
          placeholder="For God so loved the world…"
          rows={2}
          className="w-full bg-transparent outline-none text-[14px] text-gray-800 leading-relaxed italic resize-none placeholder-gray-300"
        />
      </div>
    </div>
  );
}
