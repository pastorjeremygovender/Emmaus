/**
 * HearEmmausButton — "Hear Emmaus" speaker button for content pages.
 *
 * Uses the useHearEmmaus hook which manages a global singleton audio element
 * so only one piece of content plays at a time.
 *
 * Automatically hidden when the admin has disabled voice mode
 * (checked via useVoiceEnabled — same gate as VoiceMode and mic entry points).
 *
 * Usage:
 *   <HearEmmausButton text={entryContent} userId={user.id} />
 *
 * Props:
 *   text    — the content to speak (will be sent to TTS)
 *   userId  — for auth header and voice-enabled check
 *   label   — accessible label override (default "Hear this")
 *   className — extra class names for positioning
 */

import { Volume2, Square, Loader2 } from 'lucide-react';
import { useHearEmmaus } from '@/hooks/useHearEmmaus';
import { useVoiceEnabled } from '@/hooks/useVoiceEnabled';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface HearEmmausButtonProps {
  text: string;
  userId: string;
  label?: string;
  className?: string;
  /** Visual variant — 'icon' (default) or 'pill' */
  variant?: 'icon' | 'pill';
}

export function HearEmmausButton({
  text,
  userId,
  label = 'Hear this',
  className,
  variant = 'icon',
}: HearEmmausButtonProps) {
  const { isPlaying, play, stop } = useHearEmmaus();
  const voiceEnabled = useVoiceEnabled(userId);
  const [isLoading, setIsLoading] = useState(false);

  // Shown only when settings are confirmed enabled — fail-closed while loading (null) or disabled (false)
  if (voiceEnabled !== true) return null;

  async function handleClick() {
    if (isLoading) return;

    if (isPlaying) {
      stop();
      return;
    }

    setIsLoading(true);
    try {
      await play(text, userId);
    } finally {
      setIsLoading(false);
    }
  }

  if (variant === 'pill') {
    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        aria-label={isPlaying ? 'Stop' : label}
        className={cn(
          'flex items-center gap-1.5 text-[12px] text-muted-foreground/70 hover:text-primary transition-colors px-3 py-1.5 rounded-full border border-border/60 hover:border-primary/30 bg-background',
          isPlaying && 'text-primary border-primary/40',
          className,
        )}
      >
        {isLoading ? (
          <Loader2 size={13} className="animate-spin" />
        ) : isPlaying ? (
          <Square size={13} className="fill-current" />
        ) : (
          <Volume2 size={13} />
        )}
        <span>{isLoading ? 'Loading…' : isPlaying ? 'Stop' : 'Hear Emmaus'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      aria-label={isPlaying ? 'Stop' : label}
      className={cn(
        'flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors',
        isPlaying && 'text-primary bg-primary/10',
        isLoading && 'cursor-wait',
        className,
      )}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : isPlaying ? (
        <Square size={16} className="fill-current" />
      ) : (
        <Volume2 size={16} />
      )}
    </button>
  );
}
