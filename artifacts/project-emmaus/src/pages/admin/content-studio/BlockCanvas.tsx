/**
 * BlockCanvas — The central block-based editing surface.
 *
 * Design principles:
 *   - Generous spacing: blocks breathe
 *   - Minimal chrome: no heavy borders unless focused/hovered
 *   - Controls appear on hover, disappear when writing
 *
 * AI actions (per-block sparkle button):
 *   - Appears next to existing Duplicate / Delete actions on hover
 *   - Opens a dropdown with: Rewrite, Shorten, Expand, Make Warmer,
 *     Make Clearer, Suggest Prayer, Suggest Action, Find Scripture, Regenerate
 *   - Uses a "compare panel" — suggestion is shown below the block
 *     with Accept / Keep Original buttons. No silent overwrites.
 */

import React, { useState, useCallback, useRef } from 'react';
import { Plus, GripVertical, Trash2, Copy, Sparkles, ChevronDown, Check, X as XIcon, Loader2 } from 'lucide-react';
import {
  Block, BlockType, createBlock, getBlockMeta,
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
import { aiBlockAction } from '@/lib/journeys-api';

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  journeyContext?: string; // e.g. "10 Minutes with Jesus — John 15 devotional"
}

interface SlashState {
  blockId: string;
  query: string;
  anchor: { top: number; left: number };
}

// ─── AI actions menu ──────────────────────────────────────────────────────────

const AI_ACTIONS: Array<{ id: string; label: string; applicableTo?: BlockType[] }> = [
  { id: 'rewrite',        label: 'Rewrite' },
  { id: 'shorten',        label: 'Shorten' },
  { id: 'expand',         label: 'Expand' },
  { id: 'make-warmer',    label: 'Make warmer' },
  { id: 'make-clearer',   label: 'Make clearer' },
  { id: 'new-believer',   label: 'Simplify for new believers' },
  { id: 'suggest-prayer', label: 'Suggest prayer',  applicableTo: ['prayer', 'paragraph'] },
  { id: 'suggest-action', label: 'Suggest action step', applicableTo: ['action', 'paragraph'] },
  { id: 'find-scripture', label: 'Find Scripture',  applicableTo: ['scripture', 'paragraph', 'reflection', 'prayer'] },
  { id: 'regenerate',     label: 'Regenerate block' },
];

interface AISuggestion {
  blockId: string;
  action: string;
  suggestedContent: Record<string, unknown>;
}

function AIMenu({
  block,
  onSelect,
  onClose,
}: {
  block: Block;
  onSelect: (actionId: string) => void;
  onClose: () => void;
}) {
  const applicable = AI_ACTIONS.filter(a =>
    !a.applicableTo || a.applicableTo.includes(block.type as BlockType)
  );

  return (
    <div
      className="absolute right-0 top-full mt-1 z-30 w-52 bg-white border border-gray-200 rounded-xl shadow-xl py-1"
      onMouseLeave={onClose}
    >
      <div className="px-3 py-1.5 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">AI Actions</p>
      </div>
      {applicable.map(a => (
        <button
          key={a.id}
          onClick={() => { onSelect(a.id); onClose(); }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-teal-50 hover:text-teal-700 transition-colors text-left"
        >
          <Sparkles size={10} className="text-teal-400 flex-shrink-0" />
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ─── Compare panel (shown below block after AI suggestion) ────────────────────

function AIComparePanel({
  originalBlock,
  suggestion,
  onAccept,
  onKeep,
}: {
  originalBlock: Block;
  suggestion: AISuggestion;
  onAccept: () => void;
  onKeep: () => void;
}) {
  // Render a preview of the suggested content as plain text
  const preview = Object.values(suggestion.suggestedContent)
    .filter(v => typeof v === 'string')
    .join(' ')
    .slice(0, 300);

  return (
    <div className="mx-1 mb-2 rounded-xl border border-teal-200 bg-teal-50 overflow-hidden">
      <div className="px-3 py-2 border-b border-teal-100 flex items-center gap-1.5">
        <Sparkles size={11} className="text-teal-500" />
        <span className="text-[11px] font-semibold text-teal-700">AI Suggestion</span>
        <span className="ml-auto text-[10px] text-teal-400">{suggestion.action.replace(/-/g, ' ')}</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs text-teal-800 leading-relaxed whitespace-pre-wrap">{preview}</p>
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-teal-100">
        <button
          onClick={onAccept}
          className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors"
        >
          <Check size={10} /> Accept
        </button>
        <button
          onClick={onKeep}
          className="flex items-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          <XIcon size={10} /> Keep original
        </button>
      </div>
    </div>
  );
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
  const up = (content: unknown) => onChange({ ...block, content } as Block);

  switch (block.type) {
    case 'heading':      return <HeadingBlock      content={block.content} onChange={up} onSlash={onSlash} onBackspaceEmpty={onBackspaceEmpty} onEnter={onEnter} autoFocus={autoFocus} />;
    case 'paragraph':    return <ParagraphBlock    content={block.content} onChange={up} onSlash={onSlash} onBackspaceEmpty={onBackspaceEmpty} onEnter={onEnter} autoFocus={autoFocus} />;
    case 'scripture':    return <ScriptureBlock    content={block.content} onChange={up} />;
    case 'reflection':   return <ReflectionBlock   content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'prayer':       return <PrayerBlock       content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'action':       return <ActionBlock       content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'question':     return <QuestionBlock     content={block.content} onChange={up} autoFocus={autoFocus} />;
    case 'sermon-clip':  return <SermonClipBlock   content={block.content} onChange={up} />;
    case 'completion':   return <CompletionBlock   content={block.content} onChange={up} />;
    case 'divider':      return <DividerBlock      content={block.content} onChange={up} />;
    case 'quote':        return <QuoteBlock        content={block.content} onChange={up} />;
    case 'callout':      return <CalloutBlock      content={block.content} onChange={up} />;
    case 'memory-verse': return <MemoryVerseBlock  content={block.content} onChange={up} />;
    default:             return <div className="text-xs text-gray-400 italic">Unknown block type</div>;
  }
}

// ─── Add-between button ───────────────────────────────────────────────────────

function AddBetweenBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative flex items-center justify-center h-6 group/add">
      <div className="absolute inset-x-0 top-1/2 h-px bg-teal-200 opacity-0 group-hover/add:opacity-100 transition-opacity" />
      <button
        onClick={onClick}
        className="relative z-10 flex items-center justify-center w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-all opacity-0 group-hover/add:opacity-100 shadow-sm"
        title="Add block"
      >
        <Plus size={11} />
      </button>
    </div>
  );
}

// ─── Type label ───────────────────────────────────────────────────────────────

const LABEL_COLORS: Partial<Record<BlockType, string>> = {
  scripture:    'text-teal-600',
  reflection:   'text-amber-600',
  prayer:       'text-indigo-600',
  action:       'text-emerald-600',
  question:     'text-blue-600',
  'sermon-clip':'text-purple-600',
  completion:   'text-emerald-600',
  quote:        'text-gray-500',
  callout:      'text-teal-600',
  'memory-verse':'text-yellow-700',
  heading:      'text-gray-500',
  divider:      'text-gray-400',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function BlockCanvas({ blocks, onChange, journeyContext = '' }: Props) {
  const [slashState, setSlashState] = useState<SlashState | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [newBlockId, setNewBlockId] = useState<string | null>(null);

  // AI state
  const [aiMenuBlockId, setAiMenuBlockId] = useState<string | null>(null);
  const [aiLoadingBlockId, setAiLoadingBlockId] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);

  const dragIdx = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
    b.id = id;
    setNewBlockId(id);
    onChange(blocks.map(bl => bl.id === id ? b : bl));
  }, [blocks, onChange]);

  // ─── Slash menu ─────────────────────────────────────────────────────────

  const openSlash = useCallback((blockId: string) => {
    const el = document.getElementById(`block-${blockId}`);
    const rect = el?.getBoundingClientRect() ?? { top: 200, left: 200, height: 0 };
    setSlashState({
      blockId,
      query: '',
      anchor: { top: rect.top + rect.height + 4, left: rect.left },
    });
    setFocusedId(blockId);
  }, []);

  const handleSlashSelect = useCallback((type: BlockType) => {
    if (!slashState) return;
    replaceWithType(slashState.blockId, type);
    setSlashState(null);
  }, [slashState, replaceWithType]);

  // ─── Drag and drop ───────────────────────────────────────────────────────

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

  // ─── AI action handler ───────────────────────────────────────────────────

  const handleAiAction = useCallback(async (block: Block, actionId: string) => {
    setAiMenuBlockId(null);
    setAiSuggestion(null);
    setAiLoadingBlockId(block.id);
    try {
      const updatedContent = await aiBlockAction(
        actionId,
        block.type,
        block.content as Record<string, unknown>,
        journeyContext || 'Emmaus discipleship Journey',
      );
      setAiSuggestion({ blockId: block.id, action: actionId, suggestedContent: updatedContent });
    } catch {
      // Silently fail — user can retry
    } finally {
      setAiLoadingBlockId(null);
    }
  }, [journeyContext]);

  const handleAcceptSuggestion = useCallback(() => {
    if (!aiSuggestion) return;
    const block = blocks.find(b => b.id === aiSuggestion.blockId);
    if (!block) return;

    // Guard: the suggestion must be a plain object, not a nested wrapper.
    // If the AI returned { content: {...} } instead of the flat shape, unwrap it.
    let safeContent = aiSuggestion.suggestedContent;
    if (
      safeContent &&
      typeof safeContent === 'object' &&
      'content' in safeContent &&
      typeof (safeContent as Record<string, unknown>).content === 'object' &&
      Object.keys(safeContent).length === 1
    ) {
      safeContent = (safeContent as Record<string, unknown>).content as Record<string, unknown>;
    }

    // Final sanity: must have at least one string value matching the block's expected shape
    const hasStringValue = Object.values(safeContent).some(v => typeof v === 'string');
    if (!hasStringValue) {
      // Suggestion is unusable — silently discard
      setAiSuggestion(null);
      return;
    }

    updateBlock(block.id, { ...block, content: safeContent } as Block);
    setAiSuggestion(null);
  }, [aiSuggestion, blocks, updateBlock]);

  // ─── Empty state ─────────────────────────────────────────────────────────

  if (blocks.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-48 text-center rounded-2xl border-2 border-dashed border-gray-100 cursor-text py-12 hover:border-teal-100 transition-colors"
        onClick={() => { const b = createBlock('paragraph'); setNewBlockId(b.id); onChange([b]); }}
      >
        <p className="text-sm text-gray-400 font-medium">Start writing below.</p>
        <p className="text-xs text-gray-300 mt-1.5">
          Type <kbd className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-mono">/</kbd> to insert a block
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Top add zone */}
      <AddBetweenBtn onClick={() => insertAfter(null)} />

      {blocks.map((block, idx) => {
        const meta = getBlockMeta(block.type);
        const isHovered = hoveredId === block.id;
        const isFocused = focusedId === block.id;
        const isDragTarget = dragOverIdx === idx;
        const showChrome = isHovered || isFocused;
        const labelColor = LABEL_COLORS[block.type] ?? 'text-gray-400';
        const isAiLoading = aiLoadingBlockId === block.id;
        const hasSuggestion = aiSuggestion?.blockId === block.id;

        return (
          <div key={block.id}>
            <div
              id={`block-${block.id}`}
              className={`relative group flex items-start gap-1.5 rounded-xl py-2 px-1 transition-colors ${
                isFocused ? 'bg-gray-50/70' : isHovered ? 'bg-gray-50/40' : ''
              } ${isDragTarget ? 'ring-2 ring-teal-300/50' : ''} ${hasSuggestion ? 'ring-1 ring-teal-200' : ''}`}
              onMouseEnter={() => setHoveredId(block.id)}
              onMouseLeave={() => { setHoveredId(null); setAiMenuBlockId(null); }}
              onFocus={() => setFocusedId(block.id)}
              onBlur={() => setFocusedId(null)}
              draggable
              onDragStart={handleDragStart(idx)}
              onDragOver={handleDragOver(idx)}
              onDrop={handleDrop(idx)}
              onDragEnd={handleDragEnd}
            >
              {/* Drag handle */}
              <div className={`flex flex-col items-center gap-0.5 flex-shrink-0 pt-1 transition-opacity ${showChrome ? 'opacity-100' : 'opacity-0'}`}>
                <button
                  className="cursor-grab active:cursor-grabbing p-1 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
                  onMouseDown={e => e.stopPropagation()}
                  title="Drag to reorder"
                >
                  <GripVertical size={13} />
                </button>
              </div>

              {/* Block content */}
              <div className="flex-1 min-w-0">
                {/* Type label (not for paragraph/heading) */}
                {block.type !== 'paragraph' && block.type !== 'heading' && block.type !== 'divider' && (
                  <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1 ${labelColor}`}>
                    <span>{meta.icon}</span>
                    <span>{meta.label}</span>
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

              {/* Right actions */}
              <div className={`relative flex flex-col gap-0.5 flex-shrink-0 pt-0.5 transition-opacity ${showChrome ? 'opacity-100' : 'opacity-0'}`}>
                {/* AI sparkle button */}
                <div className="relative">
                  <button
                    onClick={() => setAiMenuBlockId(aiMenuBlockId === block.id ? null : block.id)}
                    title="AI actions"
                    disabled={isAiLoading}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isAiLoading
                        ? 'text-teal-400 bg-teal-50'
                        : aiMenuBlockId === block.id
                          ? 'bg-teal-50 text-teal-600'
                          : 'hover:bg-teal-50 text-gray-300 hover:text-teal-500'
                    }`}
                  >
                    {isAiLoading
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Sparkles size={12} />
                    }
                  </button>

                  {aiMenuBlockId === block.id && (
                    <AIMenu
                      block={block}
                      onSelect={(actionId) => handleAiAction(block, actionId)}
                      onClose={() => setAiMenuBlockId(null)}
                    />
                  )}
                </div>

                <button
                  onClick={() => duplicateBlock(block.id)}
                  title="Duplicate"
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={() => deleteBlock(block.id)}
                  title="Delete"
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* AI compare panel */}
            {hasSuggestion && aiSuggestion && (
              <AIComparePanel
                originalBlock={block}
                suggestion={aiSuggestion}
                onAccept={handleAcceptSuggestion}
                onKeep={() => setAiSuggestion(null)}
              />
            )}

            {/* Between-block add button */}
            <AddBetweenBtn onClick={() => insertAfter(block.id)} />
          </div>
        );
      })}

      {/* Slash menu */}
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
