import React from 'react';
import type { DividerContent } from '@/lib/blocks';

interface Props {
  content: DividerContent;
  onChange: (c: DividerContent) => void;
}

export default function DividerBlock({ content, onChange }: Props) {
  const STYLES: DividerContent['style'][] = ['solid', 'dashed', 'dots'];
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`flex-1 border-t ${
        content.style === 'dashed' ? 'border-dashed' :
        content.style === 'dots'  ? 'border-dotted' : 'border-solid'
      } border-gray-300`} />
      <div className="flex gap-1 flex-shrink-0">
        {STYLES.map(s => (
          <button
            key={s}
            onClick={() => onChange({ style: s })}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
              content.style === s
                ? 'bg-gray-700 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
