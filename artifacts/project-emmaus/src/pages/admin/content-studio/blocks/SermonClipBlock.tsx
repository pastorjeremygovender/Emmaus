import React, { useState, useCallback } from 'react';
import { Search, Video, X } from 'lucide-react';
import type { SermonClipContent } from '@/lib/blocks';
import { getApiUrl } from '@/lib/api';

interface Sermon { id: string; title: string; publishedAt?: string }
interface Props {
  content: SermonClipContent;
  onChange: (c: SermonClipContent) => void;
}

export default function SermonClipBlock({ content, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Sermon[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(!content.sermonId);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(getApiUrl('/api/youtube-archive/search'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        // results is an array of sermon segments; normalise to { id, title }
        const segments: Array<{ sermonId?: string; videoId?: string; title?: string; videoTitle?: string }> =
          data.results ?? [];
        const seen = new Set<string>();
        const sermons: Sermon[] = [];
        for (const seg of segments) {
          const id = seg.sermonId ?? seg.videoId ?? '';
          if (!id || seen.has(id)) continue;
          seen.add(id);
          sermons.push({ id, title: seg.videoTitle ?? seg.title ?? id });
        }
        setResults(sermons);
      }
    } catch { /* ignore */ }
    finally { setSearching(false); }
  }, []);

  const select = (s: Sermon) => {
    onChange({ ...content, sermonId: s.id, title: s.title });
    setShowSearch(false);
    setResults([]);
    setQuery('');
  };

  const clear = () => {
    onChange({ ...content, sermonId: undefined, title: undefined });
    setShowSearch(true);
  };

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-purple-100/60 border-b border-purple-200">
        <span className="text-sm">🎬</span>
        <span className="text-xs font-semibold text-purple-800 uppercase tracking-wide">Sermon Clip</span>
      </div>
      <div className="px-3 py-2.5 space-y-2">
        {content.sermonId ? (
          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-200">
            <Video size={14} className="text-purple-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{content.title ?? 'Linked Sermon'}</p>
              {content.timestamp !== undefined && (
                <p className="text-xs text-gray-400">
                  At {Math.floor(content.timestamp / 60)}:{String(content.timestamp % 60).padStart(2, '0')}
                </p>
              )}
            </div>
            <button onClick={clear} className="p-1 hover:bg-gray-100 rounded text-gray-400">
              <X size={13} />
            </button>
          </div>
        ) : showSearch ? (
          <div className="space-y-1.5">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); search(e.target.value); }}
                placeholder="Search sermons…"
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-purple-300"
              />
            </div>
            {results.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-36 overflow-y-auto">
                {results.slice(0, 6).map(s => (
                  <button
                    key={s.id}
                    onClick={() => select(s)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm text-gray-800"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
            {searching && <p className="text-xs text-gray-400">Searching…</p>}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-gray-500 font-medium">Timestamp (seconds)</label>
            <input
              type="number"
              value={content.timestamp ?? ''}
              onChange={e => onChange({ ...content, timestamp: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="e.g. 1230"
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-200 rounded bg-white outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium">Direct Link</label>
            <input
              type="text"
              value={content.link ?? ''}
              onChange={e => onChange({ ...content, link: e.target.value })}
              placeholder="https://…"
              className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-200 rounded bg-white outline-none"
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] text-gray-500 font-medium">Note</label>
          <input
            type="text"
            value={content.note ?? ''}
            onChange={e => onChange({ ...content, note: e.target.value })}
            placeholder="Context for the listener…"
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-gray-200 rounded bg-white outline-none"
          />
        </div>
      </div>
    </div>
  );
}
