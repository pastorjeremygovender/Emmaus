/**
 * FavouriteButton — universal ⭐ toggle for any content type.
 *
 * Usage:
 *   <FavouriteButton
 *     contentType="journey"
 *     contentId={journey.id}
 *     contentTitle={journey.title}
 *     contentRoute={`/journeys/${journey.id}`}
 *   />
 */

import { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import {
  checkFavourited,
  addFavourite,
  removeFavourite,
  type FavouriteContentType,
} from '@/lib/favourites-api';
import { cn } from '@/lib/utils';

interface Props {
  contentType: FavouriteContentType;
  contentId: string;
  contentTitle: string;
  contentSubtitle?: string;
  contentRoute: string;
  /** Extra CSS classes on the button wrapper */
  className?: string;
  /** Icon size in px (default 18) */
  size?: number;
}

export function FavouriteButton({
  contentType,
  contentId,
  contentTitle,
  contentSubtitle,
  contentRoute,
  className,
  size = 18,
}: Props) {
  const [favourited, setFavourited] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    checkFavourited(contentType, contentId)
      .then((v) => { if (!cancelled) { setFavourited(v); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contentType, contentId]);

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation(); // don't fire parent card click
    const next = !favourited;
    setFavourited(next); // optimistic
    try {
      if (next) {
        await addFavourite({ contentType, contentId, contentTitle, contentSubtitle, contentRoute });
      } else {
        await removeFavourite(contentType, contentId);
      }
    } catch {
      setFavourited(!next); // revert on failure
    }
  }

  if (loading) {
    return (
      <div
        className={cn('w-8 h-8 flex items-center justify-center', className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <button
      onClick={handleToggle}
      aria-label={favourited ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={favourited}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-full transition-all',
        'hover:bg-primary/10 active:scale-90',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className,
      )}
    >
      <Star
        size={size}
        className={cn(
          'transition-colors',
          favourited
            ? 'fill-amber-400 text-amber-400'
            : 'fill-none text-muted-foreground',
        )}
        strokeWidth={1.8}
      />
    </button>
  );
}
