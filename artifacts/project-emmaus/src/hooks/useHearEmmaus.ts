/**
 * useHearEmmaus — Global TTS hook for "Hear Emmaus" buttons on content pages.
 *
 * A module-level singleton audio element ensures only one piece of content
 * plays at a time. Any component calling play() automatically stops any
 * currently playing audio. All hook instances share the same playing state
 * via a listener registry.
 *
 * Usage:
 *   const { isPlaying, play, stop } = useHearEmmaus();
 *   await play(text, userId);
 */

import { useEffect, useState } from 'react';
import { fetchSpeechBlobUrl } from '@/lib/voice-client';

// ─── Module-level singleton ────────────────────────────────────────────────────

let _audio: HTMLAudioElement | null = null;
let _blobUrl: string | null = null;
let _isPlaying = false;

type Listener = (isPlaying: boolean) => void;
const _listeners = new Set<Listener>();

function notifyAll(playing: boolean) {
  _isPlaying = playing;
  _listeners.forEach((l) => l(playing));
}

function cleanupAudio() {
  if (_audio) {
    _audio.pause();
    _audio.src = '';
    _audio = null;
  }
  if (_blobUrl) {
    URL.revokeObjectURL(_blobUrl);
    _blobUrl = null;
  }
}

export function stopAllHearEmmaus() {
  cleanupAudio();
  notifyAll(false);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useHearEmmaus() {
  const [isPlaying, setIsPlaying] = useState(_isPlaying);

  useEffect(() => {
    // Register for global state updates
    _listeners.add(setIsPlaying);
    // Sync initial state in case something was playing when we mounted
    setIsPlaying(_isPlaying);
    return () => {
      _listeners.delete(setIsPlaying);
    };
  }, []);

  async function play(text: string, userId: string) {
    // Stop anything currently playing
    stopAllHearEmmaus();

    if (!text.trim()) return;

    notifyAll(true);

    try {
      const url = await fetchSpeechBlobUrl(text, userId);
      _blobUrl = url;

      const audio = new Audio(url);
      _audio = audio;

      audio.onended = () => {
        cleanupAudio();
        notifyAll(false);
      };

      audio.onerror = () => {
        cleanupAudio();
        notifyAll(false);
      };

      await audio.play();
    } catch {
      cleanupAudio();
      notifyAll(false);
    }
  }

  function stop() {
    stopAllHearEmmaus();
  }

  return { isPlaying, play, stop };
}
