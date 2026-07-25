import React, { useRef, useEffect } from 'react';
import type { ActionContent } from '@/lib/blocks';

interface Props {
  content: ActionContent;
  onChange: (c: ActionContent) => void;
  autoFocus?: boolean;
}

export default function ActionBlock({ content, onChange, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  const resize = () => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px'; }
  };
  return (
    <div className="rounded-lg border border-green-200 bg-green-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-green-100/60 border-b border-green-200">
        <span className="text-sm">✅</span>
        <span className="text-xs font-semibold text-green-800 uppercase tracking-wide">Action Step</span>
      </div>
      <div className="px-3 py-2.5">
        <textarea
          ref={ref}
          value={content.text}
          onChange={e => { onChange({ text: e.target.value }); resize(); }}
          onInput={resize}
          placeholder="Today, I will…"
          rows={2}
          className="w-full bg-transparent outline-none text-[14px] text-gray-800 leading-relaxed resize-none placeholder-gray-300"
        />
      </div>
    </div>
  );
}
