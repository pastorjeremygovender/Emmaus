import React, { useRef } from 'react';
import type { QuoteContent } from '@/lib/blocks';

interface Props {
  content: QuoteContent;
  onChange: (c: QuoteContent) => void;
}

export default function QuoteBlock({ content, onChange }: Props) {
  const resize = (ref: HTMLTextAreaElement | null) => {
    if (ref) { ref.style.height = 'auto'; ref.style.height = ref.scrollHeight + 'px'; }
  };
  return (
    <div className="border-l-4 border-gray-300 pl-4 py-1 space-y-1.5">
      <textarea
        value={content.text}
        onChange={e => { onChange({ ...content, text: e.target.value }); resize(e.target); }}
        onInput={e => resize(e.target as HTMLTextAreaElement)}
        placeholder="Quote text…"
        rows={2}
        className="w-full bg-transparent outline-none text-base text-gray-700 italic leading-relaxed resize-none placeholder-gray-300"
      />
      <input
        type="text"
        value={content.attribution ?? ''}
        onChange={e => onChange({ ...content, attribution: e.target.value })}
        placeholder="— Attribution"
        className="w-full bg-transparent outline-none text-sm text-gray-500 placeholder-gray-300"
      />
    </div>
  );
}
