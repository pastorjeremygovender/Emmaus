/**
 * SlashMenu — floating block-type picker triggered by typing "/" in a block.
 * Renders near the triggering element using a fixed portal approach.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BLOCK_REGISTRY, BlockType } from '@/lib/blocks';

interface Props {
  query: string;
  anchor: { top: number; left: number };
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

const GROUPS: { id: string; label: string }[] = [
  { id: 'text',       label: 'Text' },
  { id: 'devotional', label: 'Devotional' },
  { id: 'media',      label: 'Media' },
  { id: 'layout',     label: 'Layout' },
];

export default function SlashMenu({ query, anchor, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const updateMode = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', updateMode);
    return () => window.removeEventListener('resize', updateMode);
  }, []);

  const filtered = BLOCK_REGISTRY.filter(
    m =>
      !query ||
      m.label.toLowerCase().includes(query.toLowerCase()) ||
      m.description.toLowerCase().includes(query.toLowerCase())
  );

  // Clamp activeIdx when filter changes
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[activeIdx]) onSelect(filtered[activeIdx].type);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, activeIdx, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [onClose]);

  if (filtered.length === 0) {
    return (
      <div
        ref={ref}
        style={mobile ? undefined : { position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 9999 }}
        className="fixed inset-x-3 bottom-3 z-[9999] bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 md:w-64 md:rounded-xl"
      >
        <p className="text-xs text-gray-400 text-center">No block types found</p>
      </div>
    );
  }

  const grouped = GROUPS.map(g => ({
    ...g,
    items: filtered.filter(m => m.group === g.id),
  })).filter(g => g.items.length > 0);

  let globalIdx = 0;

  return (
    <div
      ref={ref}
      style={mobile ? undefined : { position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 9999 }}
      className="fixed inset-x-3 bottom-3 z-[9999] bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden max-h-[60dvh] overflow-y-auto md:w-64 md:max-h-80 md:rounded-xl"
    >
      <div className="px-4 md:px-3 pt-3 md:pt-2 pb-2 md:pb-1">
        <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">
          {query ? `"${query}"` : 'Blocks'} <span className="hidden md:inline">— ↑↓ to navigate, ↵ to insert</span>
        </p>
      </div>
      {grouped.map(group => (
        <div key={group.id}>
          <div className="px-3 py-1 text-[11px] text-gray-400 uppercase tracking-wide font-medium bg-gray-50">
            {group.label}
          </div>
          {group.items.map(meta => {
            const idx = globalIdx++;
            const active = idx === activeIdx;
            return (
              <button
                key={meta.type}
            onMouseEnter={() => setActiveIdx(idx)}
            onPointerDown={e => { e.preventDefault(); onSelect(meta.type); }}
            className={`w-full min-h-12 md:min-h-0 flex items-center gap-3 px-4 md:px-3 py-2 text-left transition-colors ${
                  active ? 'bg-teal-50' : 'hover:bg-gray-50'
                }`}
              >
                <span className="w-7 h-7 flex items-center justify-center rounded bg-gray-100 text-[14px] flex-shrink-0">
                  {meta.icon}
                </span>
                <div>
                  <div className={`text-sm font-medium ${active ? 'text-teal-800' : 'text-gray-800'}`}>
                    {meta.label}
                  </div>
                  <div className="text-[11px] text-gray-400">{meta.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
