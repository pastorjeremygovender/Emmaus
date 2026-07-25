import React, { useRef, useEffect } from 'react';
import type { ReflectionContent } from '@/lib/blocks';

interface Props {
  content: ReflectionContent;
  onChange: (c: ReflectionContent) => void;
  autoFocus?: boolean;
}

export default function ReflectionBlock({ content, onChange, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus();
  }, [autoFocus]);

  const resize = () => {
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.style.height = ref.current.scrollHeight + 'px';
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-100/60 border-b border-amber-200">
        <span className="text-sm">🪞</span>
        <span className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Reflection</span>
      </div>
      <div className="px-3 py-2.5">
        <textarea
          ref={ref}
          value={content.question}
          onChange={e => { onChange({ question: e.target.value }); resize(); }}
          onInput={resize}
          placeholder="What question invites reflection here?"
          rows={2}
          className="w-full bg-transparent outline-none text-[14px] text-gray-800 leading-relaxed resize-none placeholder-gray-300"
        />
      </div>
    </div>
  );
}
