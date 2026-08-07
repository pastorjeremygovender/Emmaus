/**
 * Favourites API — universal ⭐ feature.
 *
 * Every content type (journey, devotional, sermon-companion, bible-verse,
 * bible-chapter, sermon, ask-emmaus, room) can be favourited by the user.
 * Persistence is server-side (user_favourites table).
 */

export type FavouriteContentType =
  | 'journey'
  | 'bible-study'
  | 'devotional'
  | 'sermon-companion'
  | 'sermon'
  | 'bible-verse'
  | 'bible-chapter'
  | 'ask-emmaus'
  | 'room';

export interface Favourite {
  id: string;
  content_type: FavouriteContentType;
  content_id: string;
  content_title: string;
  content_subtitle?: string;
  content_route: string;
  created_at: string;
}

export interface AddFavouriteParams {
  contentType: FavouriteContentType;
  contentId: string;
  contentTitle: string;
  contentSubtitle?: string;
  contentRoute: string;
}

const BASE = '/api/favourites';

export async function fetchFavourites(): Promise<Favourite[]> {
  const res = await fetch(BASE, {
    headers: { 'x-user-id': 'demo', 'x-user-role': 'member' },
  });
  if (!res.ok) throw new Error('Failed to load favourites');
  const data = (await res.json()) as { favourites: Favourite[] };
  return data.favourites;
}

export async function checkFavourited(
  contentType: FavouriteContentType,
  contentId: string,
): Promise<boolean> {
  const res = await fetch(`${BASE}/check/${contentType}/${contentId}`, {
    headers: { 'x-user-id': 'demo', 'x-user-role': 'member' },
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { favourited: boolean };
  return data.favourited;
}

export async function addFavourite(params: AddFavouriteParams): Promise<void> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'demo',
      'x-user-role': 'member',
    },
    body: JSON.stringify({
      contentType: params.contentType,
      contentId: params.contentId,
      contentTitle: params.contentTitle,
      contentSubtitle: params.contentSubtitle ?? '',
      contentRoute: params.contentRoute,
    }),
  });
  if (!res.ok) throw new Error('Failed to save favourite');
}

export async function removeFavourite(
  contentType: FavouriteContentType,
  contentId: string,
): Promise<void> {
  const res = await fetch(`${BASE}/${contentType}/${contentId}`, {
    method: 'DELETE',
    headers: { 'x-user-id': 'demo', 'x-user-role': 'member' },
  });
  if (!res.ok) throw new Error('Failed to remove favourite');
}
