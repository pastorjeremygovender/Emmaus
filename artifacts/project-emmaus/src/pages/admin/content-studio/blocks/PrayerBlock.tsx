import React, { useRef, useEffect } from 'react';
import type { PrayerContent } from '@/lib/blocks';

interface Props {
  content: PrayerContent;
  onChange: (c: PrayerContent) => void;
  autoFocus?: boolean;
}

export default function PrayerBlock({ content, onChange, autoFocus }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  const resize = () => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px'; }
  };
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-100/60 border-b border-indigo-200">
        <span className="text-sm">🙏</span>
        <span className="text-xs font-semibold text-indigo-800 uppercase tracking-wide">Prayer</span>
      </div>
      <div className="px-3 py-2.5">
        <textarea
          ref={ref}
          value={content.text}
          onChange={e => { onChange({ text: e.target.value }); resize(); }}
          onInput={resize}
          placeholder="Lord, today I…"
          rows={3}
          className="w-full bg-transparent outline-none text-[14px] text-gray-700 leading-relaxed italic resize-none placeholder-gray-300"
        />
      </div>
    </div>
  );
}
