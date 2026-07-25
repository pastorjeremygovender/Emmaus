/**
 * BlockCanvas — The central block-based editing surface.
 *
 * Handles:
 * - Rendering all block components for the current step
 * - Drag-and-drop reordering (HTML5 native)
 * - Slash command menu
 * - Adding/removing blocks
 * - Keyboard shortcuts (Enter = new paragraph, Backspace on empty = delete)
 * - Add-block-between button (+) on hover
 */

import React, { useState, useCallback, useRef } from 'react';
import { Plus, GripVertical, Trash2, Copy } from 'lucide-react';
import {
  Block, BlockType, createBlock, getBlockMeta, blocksToCanonical,
} from '@/lib/blocks';
import SlashMenu from './SlashMenu';
import HeadingBlock from './blocks/HeadingBlock';
import ParagraphBlock from './blocks/ParagraphBlock';
import ScriptureBlock from './blocks/ScriptureBlock';
import ReflectionBlock from './blocks/ReflectionBlock';
import PrayerBlock from './blocks/PrayerBlock';
import ActionBlock from './blocks/ActionBlock';
import QuestionBlock from './blocks/QuestionBlock';
import SermonClipBlock from './blocks/SermonClipBlock';
import CompletionBlock from './blocks/CompletionBlock';
import DividerBlock from './blocks/DividerBlock';
import QuoteBlock from './blocks/QuoteBlock';
import CalloutBlock from './blocks/CalloutBlock';
import MemoryVerseBlock from './blocks/MemoryVerseBlock';

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

interface SlashState {
  blockId: string;
  query: string;
  anchor: { top: number; left: number };
}

// ─── Block renderer ───────────────────────────────────────────────────────────

function renderBlockContent(
  block: Block,
  onChange: (b: Block) => void,
  onSlash: () => void,
  onBackspaceEmpty: () => void,
  onEnter: () => void,
  autoFocus: boolean,
) {
  const up = (content: unknown) =>
    onChange({ ...block, content } as Block);

  switch (block.type) {
    case 'heading':
      return <HeadingBlock content={block.content} onChange={up} onSlash={onSlash} onBackspaceEmpty={onBackspaceEmpty} onEnter={onEnter} autoFocus={autoFocus} />;
    case 'paragraph':
      return <ParagraphBlock content={block.content} onChange={up} onSlash={onSlash} onBackspaceEmpty={onBackspaceEmpty} onEnter={onEnter} autoFocus={autoFocus} />;
    case 'scripture':
      return <ScriptureBlock content={block.content} onChange={up} />;
    case 'reflection':
      return <ReflectionBlock content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'prayer':
      return <PrayerBlock content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'action':
      return <ActionBlock content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'question':
      return <QuestionBlock content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'sermon-clip':
      return <SermonClipBlock content={block.content} onChange={up} />;
    case 'completion':
      return <CompletionBlock content={block.content} onChange={up} />;
    case 'divider':
      return <DividerBlock content={block.content} onChange={up} />;
    case 'quote':
      return <QuoteBlock content={block.content} onChange={up} />;
    case 'callout':
      return <CalloutBlock content={block.content} onChange={up} />;
    case 'memory-verse':
      return <MemoryVerseBlock content={block.content} onChange={up} />;
    default:
      return <div className="text-xs text-gray-400 italic">Unknown block type</div>;
  }
}

// ─── Add-between button ───────────────────────────────────────────────────────

function AddBetweenBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative flex items-center justify-center h-5 group/add">
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-200 opacity-0 group-hover/add:opacity-100 transition-opacity" />
      <button
        onClick={onClick}
        className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all opacity-0 group-hover/add:opacity-100 shadow-sm"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlockCanvas({ blocks, onChange }: Props) {
  const [slashState, setSlashState] = useState<SlashState | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [newBlockId, setNewBlockId] = useState<string | null>(null);

  // Drag state
  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const updateBlock = useCallback((id: string, b: Block) => {
    onChange(blocks.map(bl => bl.id === id ? b : bl));
  }, [blocks, onChange]);

  const deleteBlock = useCallback((id: string) => {
    const next = blocks.filter(b => b.id !== id);
    onChange(next.length ? next : [createBlock('paragraph')]);
  }, [blocks, onChange]);

  const duplicateBlock = useCallback((id: string) => {
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0) return;
    const copy = { ...blocks[idx], id: crypto.randomUUID() };
    const next = [...blocks];
    next.splice(idx + 1, 0, copy as Block);
    onChange(next);
  }, [blocks, onChange]);

  const insertAfter = useCallback((afterId: string | null, type: BlockType = 'paragraph') => {
    const b = createBlock(type);
    setNewBlockId(b.id);
    if (afterId === null) {
      onChange([b, ...blocks]);
    } else {
      const idx = blocks.findIndex(bl => bl.id === afterId);
      const next = [...blocks];
      next.splice(idx + 1, 0, b);
      onChange(next);
    }
    return b.id;
  }, [blocks, onChange]);

  const replaceWithType = useCallback((id: string, type: BlockType) => {
    const b = createBlock(type);
    b.id = id; // keep same id so focus tracking works
    setNewBlockId(id);
    onChange(blocks.map(bl => bl.id === id ? b : bl));
  }, [blocks, onChange]);

  // ─── Slash menu ────────────────────────────────────────────────────────────

  const openSlash = useCallback((blockId: string, e?: React.KeyboardEvent) => {
    const el = document.getElementById(`block-${blockId}`);
    const rect = el?.getBoundingClientRect() ?? { top: 200, left: 200, height: 0 };
    setSlashState({
      blockId,
      query: '',
      anchor: {
        top: rect.top + rect.height + 4,
        left: rect.left,
      },
    });
    setFocusedId(blockId);
  }, []);

  const handleSlashSelect = useCallback((type: BlockType) => {
    if (!slashState) return;
    replaceWithType(slashState.blockId, type);
    setSlashState(null);
  }, [slashState, replaceWithType]);

  // ─── Drag and drop ─────────────────────────────────────────────────────────

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(idx);
  };

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx.current === null || dragIdx.current === idx) return;
    const next = [...blocks];
    const [moved] = next.splice(dragIdx.current, 1);
    next.splice(idx, 0, moved);
    onChange(next);
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragIdx.current = null;
    setDragOverIdx(null);
  };

  // ─── Empty state ───────────────────────────────────────────────────────────

  if (blocks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-48 text-center border-2 border-dashed border-gray-200 rounded-xl cursor-text"
        onClick={() => { const b = createBlock('paragraph'); setNewBlockId(b.id); onChange([b]); }}
      >
        <Plus size={20} className="text-gray-300 mb-2" />
        <p className="text-sm text-gray-400">Click to start writing, or type <code className="bg-gray-100 px-1 rounded">/</code> to insert a block</p>
      </div>
    );
  }

  return (
    <div className="relative space-y-0.5">
      {/* Top add button */}
      <AddBetweenBtn onClick={() => insertAfter(null)} />

      {blocks.map((block, idx) => {
        const meta = getBlockMeta(block.type);
        const isHovered = hoveredId === block.id;
        const isFocused = focusedId === block.id;
        const isDragTarget = dragOverIdx === idx;

        return (
          <div key={block.id}>
            <div
              id={`block-${block.id}`}
              className={`relative group flex items-start gap-2 rounded-lg p-3 transition-colors ${
                isFocused ? 'bg-gray-50/80' : isHovered ? 'bg-gray-50/40' : ''
              } ${isDragTarget ? 'ring-2 ring-teal-400/50' : ''}`}
              onMouseEnter={() => setHoveredId(block.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setFocusedId(block.id)}
              onBlur={() => setFocusedId(null)}
              draggable
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDrop={handleDrop(idx)}
              onDragEnd={handleDragEnd}
            >
              {/* Drag handle + block actions */}
              <div className={`flex flex-col items-center gap-0.5 flex-shrink-0 mt-0.5 transition-opacity ${isHovered || isFocused ? 'opacity-100' : 'opacity-0'}`}>
                <button
                  className="cursor-grab active:cursor-grabbing p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100"
                  onMouseDown={e => e.stopPropagation()}
                >
                  <GripVertical size={14} />
                </button>
              </div>

              {/* Block content */}
              <div className="flex-1 min-w-0">
                {/* Type badge */}
                {block.type !== 'paragraph' && (
                  <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mb-1">
                    {meta.icon} {meta.label}
                  </div>
                )}
                {renderBlockContent(
                  block,
                  (b) => updateBlock(block.id, b),
                  () => openSlash(block.id),
                  () => deleteBlock(block.id),
                  () => insertAfter(block.id),
                  newBlockId === block.id,
                )}
              </div>

              {/* Right-side actions */}
              <div className={`flex flex-col gap-1 flex-shrink-0 transition-opacity ${isHovered || isFocused ? 'opacity-100' : 'opacity-0'}`}>
                <button
                  onClick={() => duplicateBlock(block.id)}
                  title="Duplicate block"
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={() => deleteBlock(block.id)}
                  title="Delete block"
                  className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* Add-between button */}
            <AddBetweenBtn onClick={() => insertAfter(block.id)} />
          </div>
        );
      })}

      {/* Slash menu portal */}
      {slashState && (
        <SlashMenu
          query={slashState.query}
          anchor={slashState.anchor}
          onSelect={handleSlashSelect}
          onClose={() => setSlashState(null)}
        />
      )}
    </div>
  );
}
