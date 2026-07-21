import React from 'react';
import type { GraphicContent } from '@/lib/media-studio-types';

const DIMENSIONS_RATIO: Record<string, string> = {
  '1080×1080': 'aspect-square',
  '1080×1350': 'aspect-[4/5]',
  '1200×630':  'aspect-[1200/630]',
  '1080×1920': 'aspect-[9/16]',
};

function parseGraphicContent(raw: string): GraphicContent | null {
  try { return JSON.parse(raw) as GraphicContent; }
  catch { return null; }
}

// ─── Template: Classic ─────────────────────────────────────────────────────────
function Classic({ gc, compact }: { gc: GraphicContent; compact: boolean }) {
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#1a5c51] via-[#2a7c6f] to-[#1a3d38] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative ring */}
      <div className="absolute top-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full border border-white/10" />
      <div className="absolute bottom-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full border border-white/5" />

      <p className={`text-white/40 ${compact ? 'text-[8px]' : 'text-[11px]'} uppercase tracking-[0.2em] mb-4 font-semibold`}>
        Isipingo Community Church
      </p>

      {/* Divider */}
      <div className="w-10 h-0.5 bg-amber-400 mb-4" />

      <p className={`text-white font-serif text-center leading-snug font-semibold ${compact ? 'text-[10px]' : 'text-[16px] md:text-[20px]'}`} style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}>
        "{gc.quote}"
      </p>

      <div className="w-10 h-0.5 bg-amber-400 mt-4 mb-3" />

      <p className={`text-amber-300 ${compact ? 'text-[7px]' : 'text-[11px]'} font-medium uppercase tracking-widest`}>
        {gc.scripture}
      </p>
    </div>
  );
}

// ─── Template: Modern ──────────────────────────────────────────────────────────
function Modern({ gc, compact }: { gc: GraphicContent; compact: boolean }) {
  return (
    <div className="w-full h-full bg-gray-950 flex flex-col items-start justify-end p-6 relative overflow-hidden">
      {/* Large background quote mark */}
      <span className={`absolute top-4 left-4 text-white/5 font-serif leading-none select-none ${compact ? 'text-[80px]' : 'text-[140px]'}`}>"</span>

      <div className="relative z-10 space-y-3">
        <p className={`text-white font-semibold leading-tight font-serif ${compact ? 'text-[10px]' : 'text-[17px]'}`} style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}>
          {gc.quote}
        </p>
        <div className="flex items-center gap-2">
          <div className="h-0.5 w-6 bg-teal-500" />
          <p className={`text-teal-400 font-medium ${compact ? 'text-[7px]' : 'text-[11px]'} uppercase tracking-widest`}>
            {gc.scripture}
          </p>
        </div>
        <p className={`text-gray-600 ${compact ? 'text-[6px]' : 'text-[10px]'} uppercase tracking-[0.18em]`}>
          {gc.church}
        </p>
      </div>
    </div>
  );
}

// ─── Template: Minimal ─────────────────────────────────────────────────────────
function Minimal({ gc, compact }: { gc: GraphicContent; compact: boolean }) {
  return (
    <div className="w-full h-full bg-stone-50 flex flex-col items-center justify-center p-6 border-[3px] border-teal-700/20 relative">
      <div className={`absolute top-3 left-3 right-3 bottom-3 border border-teal-700/10 pointer-events-none`} />

      <p className={`text-teal-800/30 font-serif text-center select-none ${compact ? 'text-[30px]' : 'text-[60px]'} leading-none mb-1`} style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}>"</p>

      <p className={`text-gray-900 font-serif text-center leading-snug ${compact ? 'text-[9px]' : 'text-[16px]'} mb-4 px-2`} style={{ fontFamily: "'Crimson Pro', Georgia, serif" }}>
        {gc.quote}
      </p>

      <div className="h-px w-8 bg-teal-700/40 mb-3" />

      <p className={`text-teal-700 ${compact ? 'text-[7px]' : 'text-[11px]'} font-medium tracking-widest uppercase`}>
        {gc.scripture}
      </p>
      <p className={`text-gray-400 ${compact ? 'text-[6px]' : 'text-[9px]'} tracking-widest uppercase mt-1`}>
        {gc.church}
      </p>
    </div>
  );
}

// ─── Public component ──────────────────────────────────────────────────────────

export default function GraphicPreview({
  raw,
  maxWidth = 'max-w-[320px]',
  compact = false,
}: {
  raw: string;
  maxWidth?: string;
  compact?: boolean;
}) {
  const gc = parseGraphicContent(raw);
  if (!gc) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-xs text-gray-500 text-center">
        Invalid graphic data
      </div>
    );
  }

  const ratio = DIMENSIONS_RATIO[gc.dimensions] ?? 'aspect-square';

  return (
    <div className={`${maxWidth} w-full mx-auto rounded-lg overflow-hidden shadow-md`}>
      <div className={`${ratio} relative`}>
        <div className="absolute inset-0">
          {gc.template === 'classic' && <Classic gc={gc} compact={compact} />}
          {gc.template === 'modern' && <Modern gc={gc} compact={compact} />}
          {gc.template === 'minimal' && <Minimal gc={gc} compact={compact} />}
        </div>
      </div>
      {!compact && (
        <div className="bg-gray-50 border-t border-gray-200 px-3 py-1.5 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">{gc.dimensions}</span>
          <span className="text-[10px] text-gray-400 capitalize">{gc.template} template</span>
        </div>
      )}
    </div>
  );
}
