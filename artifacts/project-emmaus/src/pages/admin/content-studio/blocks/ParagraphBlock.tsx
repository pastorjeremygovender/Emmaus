import React, { useRef, useEffect } from 'react';
import type { ParagraphContent } from '@/lib/blocks';

interface Props {
  content: ParagraphContent;
  onChange: (c: ParagraphContent) => void;
  onSlash?: () => void;
  onBackspaceEmpty?: () => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}

export default function ParagraphBlock({ content, onChange, onSlash, onBackspaceEmpty, onEnter, autoFocus, placeholder }: Props) {
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
    <textarea
      ref={ref}
      value={content.text}
      placeholder={placeholder ?? 'Write something, or type / for blocks…'}
      rows={1}
      className="w-full resize-none overflow-hidden bg-transparent outline-none text-[15px] text-gray-800 leading-relaxed placeholder-gray-300"
      onInput={resize}
      onChange={e => { onChange({ text: e.target.value }); resize(); }}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter?.(); }
        if (e.key === 'Backspace' && !content.text) { e.preventDefault(); onBackspaceEmpty?.(); }
        if (e.key === '/' && !content.text) { e.preventDefault(); onSlash?.(); }
      }}
    />
  );
}
