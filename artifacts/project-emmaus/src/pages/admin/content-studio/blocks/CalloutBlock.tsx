import React, { useRef } from 'react';
import type { CalloutContent } from '@/lib/blocks';

interface Props {
  content: CalloutContent;
  onChange: (c: CalloutContent) => void;
}

const VARIANT_CLASSES: Record<string, string> = {
  info:    'border-blue-200 bg-blue-50/60',
  warning: 'border-yellow-300 bg-yellow-50/60',
  tip:     'border-teal-200 bg-teal-50/60',
};

export default function CalloutBlock({ content, onChange }: Props) {
  const resize = (ref: HTMLTextAreaElement | null) => {
    if (ref) { ref.style.height = 'auto'; ref.style.height = ref.scrollHeight + 'px'; }
  };
  const variant = content.variant ?? 'tip';
  return (
    <div className={`rounded-lg border ${VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.tip} p-3 flex gap-3`}>
      <input
        type="text"
        value={content.emoji ?? '💡'}
        onChange={e => onChange({ ...content, emoji: e.target.value })}
        maxLength={2}
        className="w-8 bg-transparent outline-none text-xl text-center flex-shrink-0 self-start"
      />
      <div className="flex-1 space-y-1.5">
        <textarea
          value={content.text}
          onChange={e => { onChange({ ...content, text: e.target.value }); resize(e.target); }}
          onInput={e => resize(e.target as HTMLTextAreaElement)}
          placeholder="Callout text…"
          rows={2}
          className="w-full bg-transparent outline-none text-sm text-gray-800 leading-relaxed resize-none placeholder-gray-300"
        />
        <div className="flex gap-1">
          {(['tip', 'info', 'warning'] as const).map(v => (
            <button
              key={v}
              onClick={() => onChange({ ...content, variant: v })}
              className={`px-2 py-0.5 rounded text-[10px] capitalize transition-colors ${
                variant === v ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
