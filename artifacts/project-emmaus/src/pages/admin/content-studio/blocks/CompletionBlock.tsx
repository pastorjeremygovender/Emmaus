import React from 'react';
import type { CompletionContent } from '@/lib/blocks';

interface Props {
  content: CompletionContent;
  onChange: (c: CompletionContent) => void;
}

export default function CompletionBlock({ content, onChange }: Props) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-100/60 border-b border-emerald-200">
        <span className="text-sm">🏁</span>
        <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">Day Completion</span>
      </div>
      <div className="px-3 py-2.5">
        <input
          type="text"
          value={content.message}
          onChange={e => onChange({ message: e.target.value })}
          className="w-full bg-transparent outline-none text-sm text-emerald-800 font-medium placeholder-emerald-300"
          placeholder="Completion message…"
        />
      </div>
    </div>
  );
}
