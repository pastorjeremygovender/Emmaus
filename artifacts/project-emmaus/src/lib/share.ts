/**
 * share.ts — shared content-sharing utility for Emmaus pilot.
 *
 * Supports Web Share API (native sheet) with clipboard fallback.
 * Never shares user notes, reflections, prayer journal entries,
 * personal progress, or unpublished content.
 */

export interface SharePayload {
  /** Series / journey name — e.g. "10 Minutes with Jesus" */
  contentTitle: string;
  /** Day or step title — e.g. "Prayer: Talking with Your Father" */
  dayTitle?: string;
  /** Scripture reference only — e.g. "Matthew 6:9–13" */
  scripture?: string;
  /**
   * A single short key thought taken from the published content.
   * Priority: closing line → devotional/considerThis first sentence.
   * Must be pre-extracted by the caller — never generated at share-time.
   */
  keyThought?: string;
}

/**
 * Extract the first meaningful sentence from a text block.
 * Capped at 200 characters so the shared snippet stays short.
 */
export function extractFirstSentence(text: string | undefined | null): string | undefined {
  if (!text?.trim()) return undefined;
  const clean = text.trim();
  // Sentence boundary: .!? followed by whitespace or end-of-string
  const match = clean.match(/^.+?[.!?](?:\s|$)/s);
  const sentence = match ? match[0].trim() : clean;
  if (sentence.length <= 200) return sentence;
  // Truncate cleanly at a word boundary
  const truncated = sentence.slice(0, 197);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 120 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

/** Build the share text from a payload. Uses the current page URL as the deep link. */
export function buildShareText(payload: SharePayload): string {
  const { contentTitle, dayTitle, scripture, keyThought } = payload;
  const heading = dayTitle ? `${contentTitle} — ${dayTitle}` : contentTitle;
  const lines: string[] = [heading];
  if (scripture?.trim()) lines.push('', scripture.trim());
  if (keyThought?.trim()) lines.push('', `"${keyThought.trim()}"`);
  lines.push('', 'Shared from Emmaus');
  lines.push(window.location.href);
  return lines.join('\n');
}

/**
 * Attempt to share content.
 *
 * Returns:
 *   'native'    — Web Share API accepted the share (native sheet opened)
 *   'clipboard' — clipboard fallback was used (caller should confirm to user)
 *
 * Throws only if clipboard also fails.
 */
export async function shareContent(payload: SharePayload): Promise<'native' | 'clipboard'> {
  const text = buildShareText(payload);
  const title = payload.dayTitle ?? payload.contentTitle;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'native';
    } catch (err: unknown) {
      // AbortError = user dismissed the native sheet — treat as success
      if (err instanceof Error && err.name === 'AbortError') return 'native';
      // Any other error: fall through to clipboard
    }
  }

  // Clipboard fallback
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    // Final fallback for very old browsers
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }
  return 'clipboard';
}
