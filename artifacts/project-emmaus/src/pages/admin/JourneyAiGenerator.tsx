/**
 * JourneyAiGenerator — modal for generating a complete discipleship journey
 * using the Emmaus AI.
 *
 * The generated journey is saved as Draft and opened in the editor
 * immediately. Nothing publishes automatically.
 */

import React, { useState } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { generateJourneyWithAI } from '@/lib/journeys-api';
import { useAuth } from '@/contexts/AuthContext';

const EXAMPLE_PROMPTS = [
  'Create a 7-day journey on prayer',
  'Create a 14-day journey through the Psalms',
  'Create a 5-day discipleship course on serving others',
  'Create a 30-day Proverbs journey for new believers',
  'Create a 10-day journey on forgiveness and restoration',
  'Create a 7-day journey on faith for young adults',
];

interface Props {
  onClose: () => void;
  onGenerated: (journeyId: string) => void;
}

export default function JourneyAiGenerator({ onClose, onGenerated }: Props) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');

  const handleGenerate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || generating) return;
    setGenerating(true);
    setError('');

    // Show a stepped progress message while waiting
    const steps = [
      'Reading your prompt…',
      'Planning the journey structure…',
      'Writing each step…',
      'Finalising content…',
    ];
    let stepIdx = 0;
    setProgress(steps[0]);
    const interval = setInterval(() => {
      stepIdx = Math.min(stepIdx + 1, steps.length - 1);
      setProgress(steps[stepIdx]);
    }, 4000);

    try {
      const res = await generateJourneyWithAI(trimmed, user?.id);
      clearInterval(interval);
      onGenerated(res.journeyId);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : 'Generation failed — please try again');
    } finally {
      setGenerating(false);
      setProgress('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Generate with Emmaus AI</h2>
              <p className="text-xs text-gray-400">Creates a full draft — review before publishing</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">

          {/* Prompt input */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Describe the journey you want to create
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={generating}
              placeholder="e.g. Create a 7-day journey on prayer for busy parents"
              rows={3}
              className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/30 focus:border-[#7C3AED] placeholder-gray-300 disabled:bg-gray-50"
            />
            <p className="text-xs text-gray-400 mt-1">Tip: Specify the number of days and the topic. ⌘↩ to generate.</p>
          </div>

          {/* Example prompts */}
          {!generating && !prompt && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Try an example:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLE_PROMPTS.map(ex => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#7C3AED]/40 hover:text-[#7C3AED] hover:bg-violet-50/50 transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Generating progress */}
          {generating && (
            <div className="flex items-center gap-3 bg-violet-50 rounded-xl px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-sm text-violet-700">{progress}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-gray-400">
            All generated content is saved as a <strong>Draft</strong>. A pastor or editor should review every step before publishing.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={generating}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-lg hover:from-violet-700 hover:to-purple-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {generating ? 'Generating…' : (<><Sparkles size={13} /> Generate Journey <ArrowRight size={13} /></>)}
          </button>
        </div>
      </div>
    </div>
  );
}
