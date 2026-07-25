import React, { useRef, useEffect } from 'react';
import type { HeadingContent } from '@/lib/blocks';

interface Props {
  content: HeadingContent;
  onChange: (c: HeadingContent) => void;
  onSlash?: () => void;
  onBackspaceEmpty?: () => void;
  onEnter?: () => void;
  autoFocus?: boolean;
}

const LEVEL_CLASSES: Record<number, string> = {
  1: 'text-2xl font-bold text-gray-900',
  2: 'text-xl font-semibold text-gray-800',
  3: 'text-lg font-semibold text-gray-700',
};

export default function HeadingBlock({ content, onChange, onSlash, onBackspaceEmpty, onEnter, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      const len = ref.current.value.length;
      ref.current.setSelectionRange(len, len);
    }
  }, [autoFocus]);

  const resize = () => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  };

  return (
    <div className="flex items-start gap-2">
      <select
        value={content.level}
        onChange={e => onChange({ ...content, level: Number(e.target.value) as 1|2|3 })}
        className="mt-1 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-500 bg-white flex-shrink-0"
      >
        <option value={1}>H1</option>
        <option value={2}>H2</option>
        <option value={3}>H3</option>
      </select>
      <textarea
        ref={ref}
        value={content.text}
        placeholder="Heading…"
        rows={1}
        className={`flex-1 resize-none overflow-hidden bg-transparent outline-none placeholder-gray-300 leading-tight ${LEVEL_CLASSES[content.level] ?? LEVEL_CLASSES[2]}`}
        onInput={resize}
        onChange={e => { onChange({ ...content, text: e.target.value }); resize(); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onEnter?.(); }
          if (e.key === 'Backspace' && !content.text) { e.preventDefault(); onBackspaceEmpty?.(); }
          if (e.key === '/' && !content.text) { e.preventDefault(); onSlash?.(); }
        }}
      />
    </div>
  );
}
