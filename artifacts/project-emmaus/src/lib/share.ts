/**
 * share.ts — shared content-sharing utility for Emmaus pilot.
 *
 * Every share is a complete, untruncated act of discipleship.
 * The recipient receives the full devotional or study, plus Emmaus branding
 * and an invitation to continue their journey.
 *
 * Supports Web Share API (native sheet) with clipboard fallback.
 * Never shares user notes, personal reflections, prayer journal entries,
 * personal progress, or unpublished content.
 */

export interface SharePayload {
  /** Series / journey name — e.g. "10 Minutes with Jesus" */
  title: string;
  /** Day or step title — e.g. "Prayer: Talking with Your Father" */
  dayTitle?: string;
  /** Scripture reference only — e.g. "Matthew 6:9–13" */
  scripture?: string;
  /** Opening paragraph / mentor introduction */
  greeting?: string;
  /** Main devotional body: considerThis / devotional / reflection */
  reflection?: string;
  /** Prayer text */
  prayer?: string;
  /** Call to action / next step text */
  nextStep?: string;
  /** Closing thought */
  closing?: string;
  /**
   * The deep link shown below "Continue your journey in Emmaus:".
   *   undefined (default) → use window.location.href
   *   null                → suppress the "Continue your journey" block entirely
   *                         (used for verse-level Bible shares)
   */
  deepLink?: string | null;
}

/**
 * @deprecated No longer used by the main formatter.
 * Kept so any callers not yet migrated don't break at compile time.
 */
export function extractFirstSentence(text: string | undefined | null): string | undefined {
  if (!text?.trim()) return undefined;
  const clean = text.trim();
  const match = clean.match(/^.+?[.!?](?:\s|$)/s);
  const sentence = match ? match[0].trim() : clean;
  if (sentence.length <= 200) return sentence;
  const truncated = sentence.slice(0, 197);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 120 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

/**
 * Build the complete share text from a payload.
 *
 * Rules:
 *  • Sections are separated by exactly one blank line.
 *  • Empty / null / whitespace-only sections are silently omitted.
 *  • Scripture is prefixed with 📖.
 *  • When deepLink is null the "Continue your journey" block is suppressed.
 *  • The Emmaus + ICC footer is always present and never abbreviated.
 */
export function buildShareText(payload: SharePayload): string {
  const { title, dayTitle, scripture, greeting, reflection, prayer, nextStep, closing, deepLink } = payload;

  // Resolve the deep link:
  //   explicit string → use as-is
  //   undefined       → current page URL
  //   null            → omit block entirely
  const resolvedLink: string | null =
    deepLink === null
      ? null
      : deepLink
        ? deepLink
        : typeof window !== 'undefined'
          ? window.location.href
          : null;

  function nonEmpty(s: string | undefined | null): string | null {
    return s?.trim() ? s.trim() : null;
  }

  const sections: string[] = [];

  // Heading: "Series Title\nDay Title" (two lines, one unit) or just the series title
  const dayTitleClean = nonEmpty(dayTitle);
  sections.push(dayTitleClean ? `${title}\n${dayTitleClean}` : title);

  // Scripture
  const sc = nonEmpty(scripture);
  if (sc) sections.push(`📖 ${sc}`);

  // Body sections — never truncated
  const g = nonEmpty(greeting);
  if (g) sections.push(g);

  const r = nonEmpty(reflection);
  if (r) sections.push(r);

  const pr = nonEmpty(prayer);
  if (pr) sections.push(pr);

  const ns = nonEmpty(nextStep);
  if (ns) sections.push(ns);

  const cl = nonEmpty(closing);
  if (cl) sections.push(cl);

  // Deep link block
  if (resolvedLink) {
    sections.push(`Continue your journey in Emmaus:\n${resolvedLink}`);
  }

  // Branding footer — verbatim, never abbreviated
  sections.push('Shared from Emmaus\n\nA discipleship ministry of\nIsipingo Community Church');

  return sections.join('\n\n');
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
  const shareTitle = payload.dayTitle ?? payload.title;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: shareTitle, text });
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
