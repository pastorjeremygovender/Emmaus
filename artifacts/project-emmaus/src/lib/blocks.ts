/**
 * Block type definitions for the Emmaus Content Studio block-based editor.
 *
 * Blocks are stored in journey_steps.content.blocks (JSONB array).
 * Each block has a stable `id`, a `type`, and a `content` object.
 *
 * Canonical step fields are also extracted from blocks on save for
 * backward compatibility with the existing form-based editor.
 */

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'scripture'
  | 'reflection'
  | 'prayer'
  | 'question'
  | 'action'
  | 'sermon-clip'
  | 'completion'
  | 'divider'
  | 'quote'
  | 'callout'
  | 'memory-verse';

// ─── Block content shapes ───────────────────────────────────────────────────

export interface HeadingContent    { text: string; level: 1 | 2 | 3 }
export interface ParagraphContent  { text: string }
export interface ScriptureContent  { reference: string; translation?: string; text?: string }
export interface ReflectionContent { question: string }
export interface PrayerContent     { text: string }
export interface QuestionContent   { question: string }
export interface ActionContent     { text: string }
export interface SermonClipContent { sermonId?: string; title?: string; timestamp?: number; link?: string; note?: string }
export interface CompletionContent { message: string }
export interface DividerContent    { style?: 'solid' | 'dashed' | 'dots' }
export interface QuoteContent      { text: string; attribution?: string }
export interface CalloutContent    { text: string; emoji?: string; variant?: 'info' | 'warning' | 'tip' }
export interface MemoryVerseContent { reference: string; text: string; translation?: string }

// ─── Discriminated union ────────────────────────────────────────────────────

export type Block =
  | { id: string; type: 'heading';      content: HeadingContent }
  | { id: string; type: 'paragraph';    content: ParagraphContent }
  | { id: string; type: 'scripture';    content: ScriptureContent }
  | { id: string; type: 'reflection';   content: ReflectionContent }
  | { id: string; type: 'prayer';       content: PrayerContent }
  | { id: string; type: 'question';     content: QuestionContent }
  | { id: string; type: 'action';       content: ActionContent }
  | { id: string; type: 'sermon-clip';  content: SermonClipContent }
  | { id: string; type: 'completion';   content: CompletionContent }
  | { id: string; type: 'divider';      content: DividerContent }
  | { id: string; type: 'quote';        content: QuoteContent }
  | { id: string; type: 'callout';      content: CalloutContent }
  | { id: string; type: 'memory-verse'; content: MemoryVerseContent };

// ─── Block metadata for menus ──────────────────────────────────────────────

export interface BlockMeta {
  type: BlockType;
  label: string;
  description: string;
  icon: string;        // emoji or lucide icon name
  group: 'text' | 'devotional' | 'media' | 'layout';
  defaultContent: Block['content'];
}

export const BLOCK_REGISTRY: BlockMeta[] = [
  {
    type: 'heading',
    label: 'Heading',
    description: 'Section title',
    icon: 'H',
    group: 'text',
    defaultContent: { text: '', level: 2 },
  },
  {
    type: 'paragraph',
    label: 'Paragraph',
    description: 'Body text',
    icon: '¶',
    group: 'text',
    defaultContent: { text: '' },
  },
  {
    type: 'scripture',
    label: 'Scripture',
    description: 'Bible passage with reference',
    icon: '📖',
    group: 'devotional',
    defaultContent: { reference: '', translation: 'NIV', text: '' },
  },
  {
    type: 'reflection',
    label: 'Reflection Question',
    description: 'A question for personal reflection',
    icon: '🪞',
    group: 'devotional',
    defaultContent: { question: '' },
  },
  {
    type: 'prayer',
    label: 'Prayer',
    description: 'Guided prayer in first person',
    icon: '🙏',
    group: 'devotional',
    defaultContent: { text: '' },
  },
  {
    type: 'question',
    label: 'Discussion Question',
    description: 'Group or journaling question',
    icon: '❓',
    group: 'devotional',
    defaultContent: { question: '' },
  },
  {
    type: 'action',
    label: 'Action Step',
    description: 'Concrete next step',
    icon: '✅',
    group: 'devotional',
    defaultContent: { text: '' },
  },
  {
    type: 'memory-verse',
    label: 'Memory Verse',
    description: 'Verse to memorise',
    icon: '⭐',
    group: 'devotional',
    defaultContent: { reference: '', text: '', translation: 'NIV' },
  },
  {
    type: 'sermon-clip',
    label: 'Sermon Clip',
    description: 'Link to a sermon or timestamp',
    icon: '🎬',
    group: 'media',
    defaultContent: { title: '', note: '' },
  },
  {
    type: 'quote',
    label: 'Quote',
    description: 'Inspirational or attributed quote',
    icon: '"',
    group: 'text',
    defaultContent: { text: '', attribution: '' },
  },
  {
    type: 'callout',
    label: 'Callout',
    description: 'Highlighted note or tip',
    icon: '💡',
    group: 'layout',
    defaultContent: { text: '', emoji: '💡', variant: 'tip' },
  },
  {
    type: 'completion',
    label: 'Completion',
    description: 'Day completion marker',
    icon: '🏁',
    group: 'layout',
    defaultContent: { message: 'Well done! You have completed today\'s reading.' },
  },
  {
    type: 'divider',
    label: 'Divider',
    description: 'Horizontal separator',
    icon: '—',
    group: 'layout',
    defaultContent: { style: 'solid' },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createBlock(type: BlockType): Block {
  const meta = BLOCK_REGISTRY.find(m => m.type === type);
  if (!meta) throw new Error(`Unknown block type: ${type}`);
  return {
    id: crypto.randomUUID(),
    type,
    content: { ...meta.defaultContent },
  } as Block;
}

export function getBlockMeta(type: BlockType): BlockMeta {
  return BLOCK_REGISTRY.find(m => m.type === type) ?? BLOCK_REGISTRY[1];
}

/**
 * Convert existing canonical step fields into a default block layout.
 * Used when opening a step in the block editor for the first time.
 */
export function stepToBlocks(step: {
  title?: string;
  mentorIntro?: string;
  scripture?: string;
  devotional?: string;
  reflectionQuestion?: string;
  prayerPrompt?: string;
  actionStep?: string;
  memoryVerse?: string;
}): Block[] {
  const blocks: Block[] = [];

  if (step.mentorIntro?.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: 'paragraph', content: { text: step.mentorIntro } });
  }
  if (step.scripture?.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: 'scripture', content: { reference: step.scripture, translation: 'NIV', text: '' } });
  }
  if (step.devotional?.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: 'paragraph', content: { text: step.devotional } });
  }
  if (step.reflectionQuestion?.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: 'reflection', content: { question: step.reflectionQuestion } });
  }
  if (step.prayerPrompt?.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: 'prayer', content: { text: step.prayerPrompt } });
  }
  if (step.actionStep?.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: 'action', content: { text: step.actionStep } });
  }
  if (step.memoryVerse?.trim()) {
    blocks.push({ id: crypto.randomUUID(), type: 'memory-verse', content: { reference: '', text: step.memoryVerse, translation: 'NIV' } });
  }
  blocks.push({ id: crypto.randomUUID(), type: 'completion', content: { message: 'Well done! You have completed today\'s reading.' } });

  if (blocks.length === 0) {
    blocks.push(createBlock('paragraph'));
  }

  return blocks;
}

/**
 * Extract canonical step field values from a blocks array.
 * Used when saving to keep the old form-based editor in sync.
 */
export function blocksToCanonical(blocks: Block[]): {
  mentorIntro: string;
  scripture: string;
  devotional: string;
  reflectionQuestion: string;
  prayerPrompt: string;
  actionStep: string;
  memoryVerse: string;
} {
  const out = {
    mentorIntro: '',
    scripture: '',
    devotional: '',
    reflectionQuestion: '',
    prayerPrompt: '',
    actionStep: '',
    memoryVerse: '',
  };

  // First-occurrence wins for each canonical field
  for (const b of blocks) {
    if (b.type === 'scripture' && !out.scripture) {
      out.scripture = (b.content as ScriptureContent).reference;
    }
    if (b.type === 'reflection' && !out.reflectionQuestion) {
      out.reflectionQuestion = (b.content as ReflectionContent).question;
    }
    if (b.type === 'prayer' && !out.prayerPrompt) {
      out.prayerPrompt = (b.content as PrayerContent).text;
    }
    if (b.type === 'action' && !out.actionStep) {
      out.actionStep = (b.content as ActionContent).text;
    }
    if (b.type === 'memory-verse' && !out.memoryVerse) {
      out.memoryVerse = (b.content as MemoryVerseContent).text;
    }
  }

  // First paragraph becomes mentorIntro, second becomes devotional
  const paras = blocks.filter(b => b.type === 'paragraph');
  if (paras[0]) out.mentorIntro = (paras[0].content as ParagraphContent).text;
  if (paras[1]) out.devotional  = (paras[1].content as ParagraphContent).text;

  return out;
}
