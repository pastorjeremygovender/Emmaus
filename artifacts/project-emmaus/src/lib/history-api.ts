/**
 * History API — recently viewed content.
 *
 * Records are stored server-side (user_history table) and deduped
 * so each content item only appears once (most recent view wins).
 */

export interface HistoryEntry {
  id: string;
  content_type: string;
  content_id: string;
  content_title: string;
  content_route: string;
  viewed_at: string;
}

export interface RecordViewParams {
  contentType: string;
  contentId: string;
  contentTitle: string;
  contentRoute: string;
}

const BASE = '/api/history';

export async function fetchHistory(limit = 50): Promise<HistoryEntry[]> {
  const res = await fetch(`${BASE}?limit=${limit}`, {
    headers: { 'x-user-id': 'demo', 'x-user-role': 'member' },
  });
  if (!res.ok) throw new Error('Failed to load history');
  const data = (await res.json()) as { history: HistoryEntry[] };
  return data.history;
}

/** Fire-and-forget: record that the user viewed a piece of content. */
export function recordView(params: RecordViewParams): void {
  fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'demo',
      'x-user-role': 'member',
    },
    body: JSON.stringify(params),
  }).catch(() => {
    // Non-fatal — history is a best-effort feature
  });
}

/** Human-readable relative time label (e.g. "Just now", "2h ago", "Monday"). */
export function historyTimeLabel(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(isoString).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
